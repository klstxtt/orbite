import { useState, type CSSProperties, type ReactElement } from 'react'
import { sfx } from '../audio/sfx'
import { useInput } from '../input/useInput'
import s from './ui.module.css'

export interface MenuItem {
  id: string
  label: string
  /** Texte secondaire, à droite (valeur d'un réglage, précision). */
  detail?: string
  tone?: 'danger'
  /** Case à cocher : true/false l'affiche, absent = pas de case. */
  check?: boolean
  /** Pastille de couleur (#rrggbb, ou dégradé CSS). */
  swatch?: string
}

interface Props {
  title: string
  subtitle?: string
  items: readonly MenuItem[]
  onSelect: (id: string) => void
  onBack: () => void
  /** Gauche / droite sur une ligne : règle une valeur (volume…). Absent : ces directions ne font rien. */
  onAdjust?: (id: string, delta: -1 | 1) => void
}

/** Lignes visibles avant que la liste ne défile, et hauteur d'une ligne (vh). */
const VISIBLE = 7
const ROW_VH = 8.2

/**
 * Panneau de menu par-dessus l'écran courant, entièrement pilotable à la manette.
 * Tant qu'il est affiché, il reçoit seul les actions (il est au-dessus de la pile d'entrée).
 */
export function Menu({ title, subtitle, items, onSelect, onBack, onAdjust }: Props): ReactElement {
  const [cursor, setCursor] = useState(0)
  const selected = Math.min(cursor, Math.max(0, items.length - 1))
  const firstVisible = Math.max(0, Math.min(selected - Math.floor(VISIBLE / 2), items.length - VISIBLE))

  useInput((action) => {
    const item = items[selected]
    if (action === 'up' || action === 'down') {
      const next = selected + (action === 'up' ? -1 : 1)
      if (next < 0 || next >= items.length) sfx.edge()
      else {
        setCursor(next)
        sfx.move()
      }
    } else if ((action === 'left' || action === 'right') && onAdjust && item) {
      sfx.move()
      onAdjust(item.id, action === 'left' ? -1 : 1)
    } else if (action === 'confirm') {
      if (!item) return
      sfx.confirm()
      onSelect(item.id)
    } else if (action === 'back') {
      sfx.back()
      onBack()
    }
  })

  return (
    <div className={s.scrim}>
      <div className={s.panel}>
        <h2 className={s.panelTitle}>{title}</h2>
        {subtitle && <p className={s.panelSubtitle}>{subtitle}</p>}
        <div className={s.listWindow} style={{ height: `${Math.min(items.length, VISIBLE) * ROW_VH}vh` }}>
          <div className={s.list} style={{ '--offset': -firstVisible * ROW_VH } as CSSProperties}>
            {items.map((item, i) => (
              <div key={item.id} className={s.item} data-selected={i === selected} data-tone={item.tone}>
                {item.check !== undefined && <span className={s.check} data-on={item.check} />}
                {item.swatch && <span className={s.swatch} style={{ background: item.swatch }} />}
                <span className={s.itemLabel}>{item.label}</span>
                {item.detail && <span className={s.itemDetail}>{item.detail}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className={s.panelHints}>
          <span>
            <b>A</b> OK
          </span>
          <span>
            <b>B</b> Retour
          </span>
        </div>
      </div>
    </div>
  )
}
