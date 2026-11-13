import { memo, type ReactElement } from 'react'
import s from './home.module.css'

export interface Hint {
  /** Lettre ou signe dessiné dans le rond (A, B, Y, +). */
  glyph: string
  label: string
}

/** Aides de boutons en bas à droite ; elles dépendent de ce qui est sélectionné. */
export const ButtonHints = memo(function ButtonHints({ hints }: { hints: readonly Hint[] }): ReactElement {
  return (
    <div className={s.hints}>
      {hints.map((h) => (
        <span key={h.glyph + h.label} className={s.hint}>
          <span className={s.hintGlyph}>{h.glyph}</span>
          {h.label}
        </span>
      ))}
    </div>
  )
})
