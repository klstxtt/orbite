import { useEffect, useRef, useState, type ReactElement } from 'react'
import { sfx } from '../audio/sfx'
import { useInput } from '../input/useInput'
import s from './ui.module.css'

const ROWS = ['1234567890', 'azertyuiop', 'qsdfghjklm', "wxcvbn'-. "] as const
const ACTIONS = ['Maj', 'Espace', 'Effacer', 'OK'] as const
const COLUMNS = 10
/** Colonne de la grille → touche de la rangée d'actions (4 touches larges). */
const actionAt = (col: number): number => Math.min(ACTIONS.length - 1, Math.floor((col / COLUMNS) * ACTIONS.length))

interface Props {
  title: string
  initial: string
  max: number
  onSubmit: (text: string) => void
  onCancel: () => void
}

/**
 * Saisie de texte à la manette (clavier virtuel) ou au clavier physique.
 * Manette : A tape la touche, B efface (ou annule si le champ est vide), Y majuscule, + valide.
 * Clavier : on tape directement, Entrée valide, Échap annule.
 */
export function TextInput({ title, initial, max, onSubmit, onCancel }: Props): ReactElement {
  const [value, setValue] = useState(initial.slice(0, max))
  const [row, setRow] = useState(1)
  const [col, setCol] = useState(0)
  const [shift, setShift] = useState(initial.length === 0)
  // Dernières valeurs, pour l'écouteur clavier installé une seule fois.
  const latest = useRef({ value, onSubmit, onCancel })
  latest.current = { value, onSubmit, onCancel }

  const type = (char: string): void => {
    setValue((v) => (v.length < max ? v + (shift ? char.toUpperCase() : char) : v))
    setShift(false)
  }
  const erase = (): void => setValue((v) => v.slice(0, -1))
  const submit = (): void => {
    const text = latest.current.value.trim()
    if (text) latest.current.onSubmit(text)
    else sfx.edge()
  }

  // Clavier physique : capté avant la navigation, pour que les lettres, Entrée et Retour arrière servent à écrire.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key.length === 1) setValue((v) => (v.length < max ? v + e.key : v))
      else if (e.key === 'Backspace') setValue((v) => v.slice(0, -1))
      else if (e.key === 'Enter') {
        const text = latest.current.value.trim()
        if (text) latest.current.onSubmit(text)
      } else if (e.key === 'Escape') latest.current.onCancel()
      else return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [max])

  useInput((action) => {
    const rows = ROWS.length + 1
    if (action === 'left' || action === 'right') {
      const delta = action === 'left' ? -1 : 1
      // Sur la rangée d'actions, un cran = une touche large.
      const step = row === ROWS.length ? COLUMNS / ACTIONS.length : 1
      setCol((c) => Math.max(0, Math.min(COLUMNS - 1, Math.round(c + delta * step))))
      sfx.move()
    } else if (action === 'up' || action === 'down') {
      setRow((r) => (r + (action === 'up' ? -1 : 1) + rows) % rows)
      sfx.move()
    } else if (action === 'confirm') {
      sfx.confirm()
      if (row < ROWS.length) type(ROWS[row]?.[col] ?? '')
      else {
        const key = ACTIONS[actionAt(col)]
        if (key === 'Maj') setShift((v) => !v)
        else if (key === 'Espace') type(' ')
        else if (key === 'Effacer') erase()
        else submit()
      }
    } else if (action === 'back') {
      sfx.back()
      if (value.length > 0) erase()
      else onCancel()
    } else if (action === 'menu') {
      sfx.confirm()
      submit()
    } else if (action === 'options') {
      setShift((v) => !v)
    }
  })

  return (
    <div className={s.scrim}>
      <div className={s.panel}>
        <h2 className={s.panelTitle}>{title}</h2>
        <div className={s.textField}>
          <span>{value}</span>
          <i className={s.caret} />
          <span className={s.textCount}>
            {value.length} / {max}
          </span>
        </div>
        <div className={s.keys}>
          {ROWS.map((letters, r) => (
            <div key={letters} className={s.keyRow}>
              {[...letters].map((char, c) => (
                <span key={char} className={s.key} data-selected={r === row && c === col}>
                  {char === ' ' ? '␣' : shift ? char.toUpperCase() : char}
                </span>
              ))}
            </div>
          ))}
          <div className={s.keyRow}>
            {ACTIONS.map((label, i) => (
              <span
                key={label}
                className={s.key}
                data-wide="true"
                data-selected={row === ROWS.length && actionAt(col) === i}
                data-on={label === 'Maj' && shift}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className={s.panelHints}>
          <span>
            <b>A</b> Taper
          </span>
          <span>
            <b>B</b> Effacer
          </span>
          <span>
            <b>Y</b> Majuscule
          </span>
          <span>
            <b>+</b> Valider
          </span>
        </div>
      </div>
    </div>
  )
}
