/** Un jeu tel que l'accueil l'affiche. */
export interface GameView {
  id: string
  title: string
  /** URL de la jaquette carrée. */
  cover: string
  /** URL de la grande image de fond. */
  hero: string
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

/** API exposée au rendu par le preload. */
export interface Api {
  systemStatus(): Promise<SystemStatus>
  toggleFullscreen(): Promise<void>
  quit(): Promise<void>
}
