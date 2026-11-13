import type { ArtRequest, ImportRequest, ProfileAction, RenameGame, ScanRequest, SettingsPatch, Theme, ThemeAction } from './schemas'

/** Un jeu tel que l'accueil l'affiche. */
export interface GameView {
  id: string
  title: string
  kind: 'pc' | 'emulated'
  /** URL de la jaquette carrée, ou null (tuile générée). */
  cover: string | null
  /** URL de la grande image de fond, ou null. */
  hero: string | null
  /** Couleur d'accent tirée de la jaquette (#rrggbb), ou null. */
  accent: string | null
  /** Faux si le programme ou le fichier du jeu a disparu. */
  available: boolean
  /** Dernier lancement (ms), 0 si jamais lancé. */
  lastPlayed: number
  /** Secondes jouées par le profil actif. */
  playtime: number
}

export interface ProfileView {
  id: string
  name: string
  color: string
  /** URL de l'image du profil, ou null. */
  avatar: string | null
}

export interface ThemeView extends Theme {
  /** Thème fourni avec le lanceur : il ne se modifie pas, il se copie. */
  builtin: boolean
  /** URL du fond d'écran, ou null. */
  wallpaperUrl: string | null
}

export interface SettingsView {
  sfxVolume: number
  muted: boolean
  swapConfirm: boolean
  fullscreen: boolean
  homeBackdrop: 'hero' | 'theme'
  autoStart: boolean
  coverAccent: boolean
  sortRecent: boolean
  rumble: boolean
}

export interface EmulatorView {
  id: string
  name: string
  /** L'exécutable est connu et présent. */
  configured: boolean
  exePath: string
}

export type GameState =
  | { status: 'idle' }
  | { status: 'running'; id: string }
  | { status: 'error'; id: string; message: string }

/** Tout ce que le rendu affiche ; renvoyé en entier à chaque changement. */
export interface AppState {
  games: GameView[]
  emulators: EmulatorView[]
  profiles: ProfileView[]
  activeProfile: string
  settings: SettingsView
  themes: ThemeView[]
  /** Identifiant du thème actif (toujours présent dans `themes`). */
  activeTheme: string
  onboarded: boolean
  gameState: GameState
  /** Messages à montrer une fois (fichier de réglages récupéré, profil d'émulateur invalide…). */
  notices: string[]
}

/**
 * Ordre d'affichage : avec `recentFirst`, les jeux déjà lancés passent devant, du plus récent au plus
 * ancien ; les autres gardent l'ordre d'ajout.
 */
export function sortGames<T extends { lastPlayed: number }>(games: readonly T[], recentFirst: boolean): T[] {
  const list = [...games]
  return recentFirst ? list.sort((a, b) => b.lastPlayed - a.lastPlayed) : list
}

export type Result<T = null> = { ok: true; value: T } | { ok: false; error: string; cancelled?: boolean }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const fail = (error: string): Result<never> => ({ ok: false, error })
export const cancelled = (): Result<never> => ({ ok: false, error: '', cancelled: true })

/** Un jeu trouvé dans un dossier par l'import. */
export interface ImportCandidate {
  title: string
  path: string
}

export interface ScanResult {
  dir: string
  candidates: ImportCandidate[]
}

export interface WifiStatus {
  ssid: string | null
  /** Qualité du signal, 0 à 100 ; null si Windows refuse de la donner (accès à la localisation coupé). */
  signal: number | null
}

export interface BatteryStatus {
  /** 0 à 100. */
  percent: number
  charging: boolean
}

export interface SystemStatus {
  /** null : pas de Wi-Fi connecté (câble ou hors ligne). */
  wifi: WifiStatus | null
  /** null : pas de batterie (PC fixe). */
  battery: BatteryStatus | null
}

/** API exposée au rendu par le preload. Les fenêtres de choix de fichier s'ouvrent côté processus principal. */
export interface Api {
  systemStatus(): Promise<SystemStatus>
  toggleFullscreen(): Promise<void>
  quit(): Promise<void>

  getState(): Promise<AppState>
  onState(cb: (state: AppState) => void): () => void
  setOnboarded(): Promise<void>

  /** Choix d'un .exe ; renvoie l'identifiant du jeu ajouté. */
  addPcGame(): Promise<Result<string>>
  /** Choix du fichier de jeu (et de l'émulateur s'il n'est pas encore localisé). */
  addEmulatedGame(emulatorId: string): Promise<Result<string>>
  locateEmulator(emulatorId: string): Promise<Result>
  /** Choix d'un dossier, puis liste des jeux qu'il contient (ceux déjà présents sont écartés). */
  scanFolder(request: ScanRequest): Promise<Result<ScanResult>>
  /** Renvoie le nombre de jeux ajoutés. */
  importGames(request: ImportRequest): Promise<Result<number>>
  setGameArt(request: ArtRequest): Promise<Result>
  removeGame(gameId: string): Promise<Result>

  renameGame(request: RenameGame): Promise<Result>

  updateSettings(patch: SettingsPatch): Promise<Result>
  /** Renvoie l'identifiant du profil concerné. */
  profileAction(action: ProfileAction): Promise<Result<string>>
  /** Renvoie l'identifiant du thème concerné, ou le dossier d'export. */
  themeAction(action: ThemeAction): Promise<Result<string>>
  sleep(): Promise<void>

  launchGame(gameId: string): Promise<Result>
  stopGame(): Promise<void>
}
