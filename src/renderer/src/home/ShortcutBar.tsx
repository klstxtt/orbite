import { memo, type CSSProperties, type ReactElement } from 'react'
import { AddIcon, AlbumIcon, GamepadIcon, LibraryIcon, NewsIcon, PowerIcon, SettingsIcon, ThemeIcon } from './icons'
import s from './home.module.css'

export interface Shortcut {
  id: string
  label: string
  color: string
  icon: () => ReactElement
}

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'news', label: 'Actualités', color: '#ff9a3d', icon: NewsIcon },
  { id: 'album', label: 'Album', color: '#4d9bff', icon: AlbumIcon },
  { id: 'library', label: 'Tous les jeux', color: '#3ecf8e', icon: LibraryIcon },
  { id: 'add', label: 'Ajouter un jeu', color: '#ff6b8b', icon: AddIcon },
  { id: 'themes', label: 'Thèmes', color: '#b98bff', icon: ThemeIcon },
  { id: 'controllers', label: 'Manettes', color: '#d5d9e0', icon: GamepadIcon },
  { id: 'settings', label: 'Paramètres', color: '#f6cf4a', icon: SettingsIcon },
  { id: 'power', label: 'Mise en veille', color: '#eef0f3', icon: PowerIcon }
]

interface Props {
  selected: number
  focused: boolean
}

/** Barre de raccourcis ronds ; le disque rouge glisse d'un raccourci à l'autre. */
export const ShortcutBar = memo(function ShortcutBar({ selected, focused }: Props): ReactElement {
  return (
    <div className={s.bar} data-focused={focused} style={{ '--i': selected } as CSSProperties}>
      <div className={s.barDot} />
      {SHORTCUTS.map((item, i) => (
        <div key={item.id} className={s.barItem} data-selected={i === selected} style={{ color: item.color }}>
          <item.icon />
        </div>
      ))}
      <div key={selected} className={s.barLabel}>
        {SHORTCUTS[selected]?.label}
      </div>
    </div>
  )
})
