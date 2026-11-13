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
  color: z.string().regex(/^#[0-9a-f]{6}$/i)
})

export const ConfigSchema = z.object({
  version: z.literal(1).default(1),
  /** L'assistant de premier lancement a été vu. */
  onboarded: z.boolean().default(false),
  fullscreen: z.boolean().default(true),
  activeProfile: z.string().default('p1'),
  profiles: z.array(ProfileSchema).min(1).default([{ id: 'p1', name: 'Joueur', color: '#2f6fe0' }]),
  audio: z
    .object({ sfxVolume: z.number().min(0).max(100).default(70), muted: z.boolean().default(false) })
    .prefault({}),
  input: z.object({ swapConfirm: z.boolean().default(false) }).prefault({}),
  /** Où se trouve chaque émulateur sur cette machine, par identifiant de profil. */
  emulators: z.record(z.string(), z.object({ exePath: z.string().min(1) })).default({})
})
export type Config = z.infer<typeof ConfigSchema>

// ---------- library.json ----------

const gameBase = {
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  /** Noms de fichiers dans le dossier `media/` ; vide = pas d'image. */
  art: z.object({ cover: z.string().default(''), hero: z.string().default('') }).prefault({}),
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
  lastPlayed: z.record(z.string(), z.number()).default({})
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

export const ArtRequestSchema = z.object({ gameId: id, slot: z.enum(['cover', 'hero']) })
export type ArtRequest = z.infer<typeof ArtRequestSchema>
