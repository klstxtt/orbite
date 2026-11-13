import type { ReactElement, ReactNode } from 'react'

/** Pictogrammes dessinés pour le lanceur (traits simples, 24×24). */
function Icon({ children }: { children: ReactNode }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const NewsIcon = (): ReactElement => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <path d="M7.5 9.5h9M7.5 13h9M7.5 16h5" />
  </Icon>
)

export const AlbumIcon = (): ReactElement => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4.5 17l4.5-4 3.5 3 3-2.5 4 3.5" />
  </Icon>
)

export const LibraryIcon = (): ReactElement => (
  <Icon>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </Icon>
)

export const AddIcon = (): ReactElement => (
  <Icon>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v8M8 12h8" />
  </Icon>
)

export const ThemeIcon = (): ReactElement => (
  <Icon>
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.5-2.2-.6-1.4.3-2.8 1.9-2.8h1.8a3.3 3.3 0 0 0 3.3-3.3C20.5 7.3 16.7 3.5 12 3.5z" />
    <circle cx="8" cy="11" r="1" />
    <circle cx="11" cy="7.5" r="1" />
    <circle cx="15.5" cy="8.5" r="1" />
  </Icon>
)

export const GamepadIcon = (): ReactElement => (
  <Icon>
    <path d="M7.5 7.5h9a5 5 0 0 1 4.9 4l.6 3.2a2.4 2.4 0 0 1-4.2 2L16 14.5H8l-1.8 2.2a2.4 2.4 0 0 1-4.2-2l.6-3.2a5 5 0 0 1 4.9-4z" />
    <path d="M8 10v3M6.5 11.500h3M15.500 10.500h.01M17.500 12.500h.01" />
  </Icon>
)

export const SettingsIcon = (): ReactElement => (
  <Icon>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3v2.5M12 18.500V21M3 12h2.500M18.500 12H21M5.600 5.600l1.800 1.800M16.600 16.600l1.800 1.800M5.600 18.400l1.800-1.800M16.600 7.400l1.800-1.800" />
  </Icon>
)

export const PowerIcon = (): ReactElement => (
  <Icon>
    <path d="M12 3.500v8" />
    <path d="M7 6.500a8 8 0 1 0 10 0" />
  </Icon>
)

/** Case vide : une carte de jeu générique. */
export const CartridgeIcon = (): ReactElement => (
  <Icon>
    <path d="M6.500 3.500h8l3 3v14h-11z" />
    <path d="M9.500 15.500h5" />
  </Icon>
)

export const EthernetIcon = (): ReactElement => (
  <Icon>
    <rect x="9" y="3.500" width="6" height="5" rx="1" />
    <rect x="3.500" y="15.500" width="6" height="5" rx="1" />
    <rect x="14.500" y="15.500" width="6" height="5" rx="1" />
    <path d="M12 8.500V12M6.500 15.500V12h11v3.500" />
  </Icon>
)

/** Wi-Fi : `level` de 0 (aucune barre) à 3. */
export function WifiIcon({ level }: { level: number }): ReactElement {
  const dim = (n: number): number => (level >= n ? 1 : 0.28)
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 9.500a13 13 0 0 1 18 0" opacity={dim(3)} />
      <path d="M6.200 13a8.500 8.500 0 0 1 11.600 0" opacity={dim(2)} />
      <path d="M9.300 16.300a4 4 0 0 1 5.400 0" opacity={dim(1)} />
      <circle cx="12" cy="19.300" r="1.100" fill="currentColor" stroke="none" />
    </svg>
  )
}
