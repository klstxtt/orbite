import { useState, type CSSProperties, type ReactElement } from 'react'
import type { OnlineImage } from '../../../shared/types'
import { sfx } from '../audio/sfx'
import { useInput } from '../input/useInput'
import s from './ui.module.css'

interface Props {
  title: string
  subtitle?: string
  images: readonly OnlineImage[]
  /** Vignettes par ligne. */
  columns: number
  /** Hauteur d'une vignette, en vh. */
  rowVh: number
  /** Vrai : l'image est montrée entière (logo transparent) ; sinon elle remplit la vignette. */
  contain?: boolean
  onSelect: (image: OnlineImage) => void
  onBack: () => void
}

const VISIBLE_ROWS = 2
const GAP_VH = 1.6

/** Grille d'images à choisir à la manette : directions pour se déplacer, A pour prendre, B pour revenir. */
export function ImagePicker({ title, subtitle, images, columns, rowVh, contain, onSelect, onBack }: Props): ReactElement {
  const [cursor, setCursor] = useState(0)
  const selected = Math.min(cursor, Math.max(0, images.length - 1))
  const rows = Math.ceil(images.length / columns)
  const row = Math.floor(selected / columns)
  const firstRow = Math.max(0, Math.min(row, rows - VISIBLE_ROWS))
  const step = rowVh + GAP_VH

  useInput((action) => {
    const delta = action === 'left' ? -1 : action === 'right' ? 1 : action === 'up' ? -columns : action === 'down' ? columns : 0
    if (delta) {
      // Vers le bas depuis l'avant-dernière ligne : on tombe sur la dernière image si la colonne est vide.
      const next = action === 'down' && row < rows - 1 ? Math.min(selected + delta, images.length - 1) : selected + delta
      if (next < 0 || next >= images.length) sfx.edge()
      else {
        setCursor(next)
        sfx.move()
      }
    } else if (action === 'confirm') {
      const image = images[selected]
      if (!image) return
      sfx.confirm()
      onSelect(image)
    } else if (action === 'back') {
      sfx.back()
      onBack()
    }
  })

  return (
    <div className={s.scrim}>
      <div className={s.panel} data-wide="true">
        <h2 className={s.panelTitle}>{title}</h2>
        {subtitle && <p className={s.panelSubtitle}>{subtitle}</p>}
        <div className={s.listWindow} style={{ height: `${Math.min(rows, VISIBLE_ROWS) * step}vh` }}>
          <div
            className={s.thumbs}
            style={{ '--offset': -firstRow * step, '--cols': columns, '--row': rowVh, '--gap': GAP_VH } as CSSProperties}
          >
            {images.map((image, i) => (
              <div key={image.url} className={s.thumb} data-selected={i === selected} data-contain={contain === true}>
                <img src={image.thumb} alt="" loading="lazy" decoding="async" draggable={false} />
              </div>
            ))}
          </div>
        </div>
        <div className={s.panelHints}>
          <span>
            {selected + 1} / {images.length}
          </span>
          <span>
            <b>A</b> Choisir
          </span>
          <span>
            <b>B</b> Retour
          </span>
        </div>
      </div>
    </div>
  )
}
