import type { ThemeView } from '../../../shared/types'

/**
 * Applique un thème : ses couleurs deviennent des variables CSS sur la racine du document, et son
 * type de curseur un attribut que les feuilles de style lisent.
 */
export function applyTheme(theme: ThemeView): void {
  const root = document.documentElement
  const { colors } = theme
  const vars: Record<string, string> = {
    '--bg': colors.background,
    '--panel-solid': colors.panel,
    '--panel': `color-mix(in srgb, ${colors.panel} 88%, transparent)`,
    '--text': colors.text,
    '--text-dim': `color-mix(in srgb, ${colors.text} 70%, transparent)`,
    '--accent-a': colors.accentA,
    '--accent-b': colors.accentB,
    '--accent-c': colors.accentC,
    '--select': colors.select
  }
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)
  root.dataset.scheme = theme.scheme
  root.dataset.cursor = theme.cursor
  root.style.colorScheme = theme.scheme
}
