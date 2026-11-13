import { memo, type CSSProperties, type ReactElement } from 'react'
import type { GameView } from '../../../shared/types'
import { CartridgeIcon } from './icons'
import s from './home.module.css'

/** Géométrie de la rangée, en centièmes de la hauteur d'écran (vh). */
export const TILE_VH = 37
export const SMALL_SCALE = 0.585
const GAP_VH = 2.6
const SMALL_VH = TILE_VH * SMALL_SCALE
const STEP_VH = SMALL_VH + GAP_VH
/** Tuiles gardées dans le DOM de part et d'autre de la sélection. */
const WINDOW_BEFORE = 2
const WINDOW_AFTER = 12

interface Props {
  /** Les jeux, suivis de cases vides (null). */
  slots: ReadonlyArray<GameView | null>
  selected: number
  /** La rangée a le focus (sinon le contour reste, atténué et immobile). */
  focused: boolean
}

/**
 * Rangée horizontale. Chaque tuile est posée en `transform` : la sélection reste à gauche,
 * elle seule est à taille réelle, les autres sont réduites (réduire reste net, agrandir floute).
 */
export const GameRow = memo(function GameRow({ slots, selected, focused }: Props): ReactElement {
  return (
    <div className={s.row}>
      <div className={s.track} style={{ '--tx': -selected * STEP_VH } as CSSProperties}>
        {slots.map((game, i) => {
          if (i < selected - WINDOW_BEFORE || i > selected + WINDOW_AFTER) return null
          const isSelected = i === selected
          const x = i <= selected ? i * STEP_VH : selected * STEP_VH + TILE_VH + GAP_VH + (i - selected - 1) * STEP_VH
          return (
            <div
              key={game ? game.id : `vide-${i}`}
              className={s.tile}
              data-selected={isSelected}
              data-focused={isSelected && focused}
              style={{ '--x': x, '--s': isSelected ? 1 : SMALL_SCALE } as CSSProperties}
            >
              <div className={s.glow} />
              <div className={s.ring}>
                <i />
              </div>
              <div className={s.face} data-empty={!game}>
                {game ? (
                  <img src={game.cover} alt="" decoding="async" draggable={false} />
                ) : (
                  <div className={s.empty}>
                    <CartridgeIcon />
                    <span>Cartouche vide</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
