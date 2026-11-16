import { z } from 'zod'

/** Schémas des fichiers de données et des requêtes IPC : une seule source pour les types et la validation. */

const isValidRegex = (source: string): boolean => {
  try {
    new RegExp(source)
    return true
  } catch {
    return false
  }
}
const regexString = z.string().min(1).refine(isValidRegex, 'expression régulière invalide')

// ---------- config.json ----------

export const ProfileSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(24),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  /** Image du profil : nom de fichier dans `media/` ; vide = initiale sur fond de couleur. */
  avatar: z.string().default('')
})

export const ConfigSchema = z.object({
  version: z.literal(1).default(1),
  /** L'assistant de premier lancement a été vu. */
  onboarded: z.boolean().default(false),
  fullscreen: z.boolean().default(true),
  activeProfile: z.string().default('p1'),
  profiles: z.array(ProfileSchema).min(1).default([{ id: 'p1', name: 'Joueur', color: '#2f6fe0', avatar: '' }]),
  /** Identifiant du thème actif (fourni, ou dossier de `themes/`). */
  activeTheme: z.string().default('sombre'),
  /** Fond de l'accueil : image du jeu sélectionné, ou toujours le fond du thème. */
  homeBackdrop: z.enum(['hero', 'theme']).default('hero'),
  /** Lancer le lanceur à l'ouverture de session Windows. */
  autoStart: z.boolean().default(false),
  /** Le contour de sélection prend la couleur de la jaquette du jeu. */
  coverAccent: z.boolean().default(true),
  /** Les jeux joués récemment passent en premier ; sinon, ordre d'ajout. */
  sortRecent: z.boolean().default(true),
  audio: z
    .object({ sfxVolume: z.number().min(0).max(100).default(70), muted: z.boolean().default(false) })
    .prefault({}),
  input: z
    .object({
      swapConfirm: z.boolean().default(false),
      /** Courte vibration de la manette à chaque validation. */
      rumble: z.boolean().default(true)
    })
    .prefault({}),
  /** Où se trouve chaque émulateur sur cette machine, par identifiant de profil. */
  emulators: z.record(z.string(), z.object({ exePath: z.string().min(1) })).default({})
})
export type Config = z.infer<typeof ConfigSchema>

// ---------- library.json ----------

const gameBase = {
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  /** Noms de fichiers dans le dossier `media/` ; vide = pas d'image. */
  art: z
    .object({
      cover: z.string().default(''),
      hero: z.string().default(''),
      /** Logo du jeu (image transparente), montré pendant que le jeu tourne. */
      logo: z.string().default(''),
      /** Couleur vive tirée de la jaquette (#rrggbb) ; vide = couleurs du thème. */
      accent: z.string().default('')
    })
    .prefault({}),
  addedAt: z.number().default(0)
}

export const GameSchema = z.discriminatedUnion('kind', [
  z.object({
    ...gameBase,
    kind: z.literal('pc'),
    exe: z.string().min(1),
    args: z.array(z.string()).default([]),
    /** Dossier de travail ; vide = dossier de l'exécutable. */
    cwd: z.string().default('')
  }),
  z.object({
    ...gameBase,
    kind: z.literal('emulated'),
    emulatorId: z.string().min(1),
    gameFile: z.string().min(1),
    /** Arguments ajoutés après ceux du profil d'émulateur. */
    extraArgs: z.array(z.string()).default([])
  })
])
export type Game = z.infer<typeof GameSchema>

export const LibrarySchema = z.object({
  version: z.literal(1).default(1),
  games: z.array(GameSchema).default([])
})
export type Library = z.infer<typeof LibrarySchema>

// ---------- stats.json ----------

export const StatsSchema = z.object({
  /** Secondes cumulées, clé `<profil>|<jeu>`. */
  playtime: z.record(z.string(), z.number().min(0)).default({}),
  /** Dernier lancement (ms depuis l'époque), par jeu. */
  lastPlayed: z.record(z.string(), z.number()).default({}),
  /** Durée de la dernière session (secondes), par jeu. */
  lastSession: z.record(z.string(), z.number().min(0)).default({})
})
export type Stats = z.infer<typeof StatsSchema>

// ---------- emulators/<id>.json ----------

export const EmulatorProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'identifiant : minuscules, chiffres et tirets'),
  name: z.string().min(1).max(60),
  /** Noms possibles de l'exécutable (sert à vérifier le fichier choisi). */
  exeNames: z.array(z.string().min(1)).min(1),
  /** Dossiers dont l'exécutable ne doit jamais être pris (ancienne version gardée par une mise à jour…). */
  ignoreDirs: z.array(z.string().min(1)).default([]),
  /** Arguments ; `{game}` = fichier du jeu, `{emuDir}` = dossier de l'émulateur. */
  args: z
    .array(z.string())
    .refine((list) => list.some((a) => a.includes('{game}')), 'les arguments doivent contenir {game}'),
  /** Extensions proposées à l'import d'un dossier (sans point). Vide : tous les fichiers. */
  gameExtensions: z
    .array(z.string())
    .default([])
    .transform((list) => list.map((e) => e.trim().replace(/^\./, '').toLowerCase()).filter(Boolean)),
  /**
   * Comment savoir que le jeu tourne. `log` : fichier journal (`{emuDir}` accepté) et motif attendu dans
   * ses nouvelles lignes ; c'est le signal le plus fiable. `title` : motif sur le titre de la fenêtre,
   * utilisé seul, ou en repli si l'émulateur n'écrit aucun journal. Sans rien : dès que la fenêtre existe.
   */
  ready: z
    .object({
      log: z.object({ file: z.string().min(1), pattern: regexString }).optional(),
      title: regexString.optional(),
      /** Avancement lu dans le journal pendant le chargement : groupe 1 = fait, groupe 2 = total. */
      progress: regexString.optional(),
      settleMs: z.number().min(0).max(60_000).default(1500)
    })
    .prefault({}),
  /** Boîtes de dialogue à accepter automatiquement. */
  dialogs: z.array(z.object({ match: regexString, answer: z.enum(['yes', 'no', 'ok']).default('yes') })).default([])
})
export type EmulatorProfile = z.infer<typeof EmulatorProfileSchema>

// ---------- themes/<id>/theme.json ----------

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'couleur attendue au format #rrggbb')

export const ThemeSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'identifiant : minuscules, chiffres et tirets'),
  name: z.string().min(1).max(40),
  /** Base claire ou sombre : décide de la couleur du texte sur les panneaux. */
  scheme: z.enum(['dark', 'light']).default('dark'),
  colors: z.object({
    background: hex,
    panel: hex,
    text: hex,
    /** Les trois couleurs du dégradé de sélection. */
    accentA: hex,
    accentB: hex,
    accentC: hex,
    /** Disque de sélection de la barre de raccourcis. */
    select: hex
  }),
  /** Fond d'écran : nom d'un fichier du dossier du thème ; vide = aucun. */
  wallpaper: z
    .string()
    .max(80)
    .regex(/^[\w.-]*$/, 'nom de fichier simple attendu')
    .default(''),
  /** Aspect du curseur de sélection. */
  cursor: z.enum(['anneau', 'contour', 'lueur']).default('anneau'),
  /** Jeu de sons d'interface. */
  sounds: z.enum(['doux', 'retro', 'muet']).default('doux')
})
export type Theme = z.infer<typeof ThemeSchema>

// ---------- Requêtes IPC ----------

const id = z.string().min(1).max(64)

export const IdSchema = id
export const ScanRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pc') }),
  z.object({ kind: z.literal('emulated'), emulatorId: id })
])
export type ScanRequest = z.infer<typeof ScanRequestSchema>

export const ImportRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pc'), paths: z.array(z.string().min(1)).max(500) }),
  z.object({ kind: z.literal('emulated'), emulatorId: id, paths: z.array(z.string().min(1)).max(500) })
])
export type ImportRequest = z.infer<typeof ImportRequestSchema>

export const SettingsPatchSchema = z
  .object({
    sfxVolume: z.number().min(0).max(100),
    muted: z.boolean(),
    swapConfirm: z.boolean(),
    fullscreen: z.boolean(),
    homeBackdrop: z.enum(['hero', 'theme']),
    autoStart: z.boolean(),
    coverAccent: z.boolean(),
    sortRecent: z.boolean(),
    rumble: z.boolean()
  })
  .partial()
  .strict()
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

const name = (max: number): z.ZodString => z.string().trim().min(1).max(max)

export const ProfileActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), name: name(24) }),
  z.object({ type: z.literal('rename'), id, name: name(24) }),
  z.object({ type: z.literal('color'), id, color: hex }),
  z.object({ type: z.literal('pickAvatar'), id }),
  z.object({ type: z.literal('clearAvatar'), id }),
  z.object({ type: z.literal('delete'), id }),
  z.object({ type: z.literal('activate'), id })
])
export type ProfileAction = z.infer<typeof ProfileActionSchema>

export const ThemePatchSchema = z
  .object({
    name: name(40),
    scheme: z.enum(['dark', 'light']),
    accent: z.object({ a: hex, b: hex, c: hex }),
    select: hex,
    cursor: z.enum(['anneau', 'contour', 'lueur']),
    sounds: z.enum(['doux', 'retro', 'muet'])
  })
  .partial()
  .strict()
export type ThemePatch = z.infer<typeof ThemePatchSchema>

export const ThemeActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('activate'), id }),
  /** Copie du thème `fromId` sous un nouveau nom. */
  z.object({ type: z.literal('create'), name: name(40), fromId: id }),
  z.object({ type: z.literal('update'), id, patch: ThemePatchSchema }),
  z.object({ type: z.literal('pickWallpaper'), id }),
  z.object({ type: z.literal('clearWallpaper'), id }),
  z.object({ type: z.literal('delete'), id }),
  z.object({ type: z.literal('import') }),
  z.object({ type: z.literal('export'), id })
])
export type ThemeAction = z.infer<typeof ThemeActionSchema>

export const RenameGameSchema = z.object({ gameId: id, title: name(120) })
export type RenameGame = z.infer<typeof RenameGameSchema>

export const GameArgsSchema = z.object({ gameId: id, args: z.string().max(400) })
export type GameArgs = z.infer<typeof GameArgsSchema>

const artKind = z.enum(['cover', 'hero', 'logo'])

export const ArtRequestSchema = z.object({ gameId: id, slot: artKind })
export type ArtRequest = z.infer<typeof ArtRequestSchema>

