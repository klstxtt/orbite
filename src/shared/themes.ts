import type { Theme } from './schemas'

/** Couleurs de fond, de panneau et de texte des deux bases possibles d'un thème. */
export const SCHEME_BASE = {
  dark: { background: '#17181b', panel: '#26272c', text: '#ffffff' },
  light: { background: '#e9ebf0', panel: '#ffffff', text: '#1c1d21' }
} as const

/** Dégradés d'accent proposés dans l'éditeur de thème (contour de sélection, barres). */
export const ACCENT_PRESETS: ReadonlyArray<{ id: string; name: string; a: string; b: string; c: string }> = [
  { id: 'ocean', name: 'Bleu → violet', a: '#35d0ff', b: '#4f7dff', c: '#a55cff' },
  { id: 'aurore', name: 'Aurore', a: '#5ef2c2', b: '#35b8ff', c: '#7a6bff' },
  { id: 'braise', name: 'Braise', a: '#ffb347', b: '#ff6b4a', c: '#ff3d81' },
  { id: 'menthe', name: 'Menthe', a: '#b8ff7a', b: '#3fdc8a', c: '#18b6a6' },
  { id: 'or', name: 'Or', a: '#fff1a8', b: '#ffc93c', c: '#ff9a3d' },
  { id: 'rose', name: 'Rose', a: '#ffc2e2', b: '#ff7ac0', c: '#c66bff' }
]

export const PROFILE_COLORS: readonly string[] = ['#2f6fe0', '#e0457b', '#2fae6b', '#e08a2f', '#8a5be0', '#d94444', '#1fa6b8', '#6b7280']

export const DEFAULT_THEME_ID = 'sombre'

const theme = (id: string, name: string, scheme: 'dark' | 'light', accent: number, select: string, bg?: string, panel?: string): Theme => {
  const a = ACCENT_PRESETS[accent] ?? ACCENT_PRESETS[0]
  const base = SCHEME_BASE[scheme]
  return {
    id,
    name,
    scheme,
    colors: {
      background: bg ?? base.background,
      panel: panel ?? base.panel,
      text: base.text,
      accentA: a?.a ?? '#35d0ff',
      accentB: a?.b ?? '#4f7dff',
      accentC: a?.c ?? '#a55cff',
      select
    },
    wallpaper: '',
    cursor: 'anneau',
    sounds: 'doux'
  }
}

/** Thèmes fournis avec le lanceur ; ils ne peuvent pas être modifiés, seulement copiés. */
export const BUILTIN_THEMES: readonly Theme[] = [
  theme('sombre', 'Sombre', 'dark', 0, '#e8242c'),
  theme('clair', 'Clair', 'light', 0, '#e8242c'),
  theme('minuit', 'Minuit', 'dark', 1, '#3a7bff', '#0b1020', '#182038'),
  theme('foret', 'Forêt', 'dark', 3, '#2fae6b', '#0f1a14', '#1b2a22'),
  theme('sakura', 'Sakura', 'light', 5, '#e0457b', '#fbeef3', '#ffffff')
]
