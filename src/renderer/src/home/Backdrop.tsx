import { useEffect, useRef, useState, type ReactElement } from 'react'
import s from './home.module.css'

/** Attente avant de changer de fond : un défilement rapide ne charge pas chaque image au passage. */
const SETTLE_MS = 140

/**
 * Fond plein écran en fondu enchaîné. Deux calques : la nouvelle image est chargée et décodée
 * dans le calque caché, puis les opacités s'échangent. Aucun clignotement, aucun reflow.
 */
export function Backdrop({ src }: { src: string | null }): ReactElement {
  const [layers, setLayers] = useState<readonly [string | null, string | null]>([null, null])
  const [front, setFront] = useState<0 | 1>(0)
  const [visible, setVisible] = useState(false)
  const frontRef = useRef<0 | 1>(0)

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!src) {
        setVisible(false)
        return
      }
      const img = new Image()
      img.src = src
      void img
        .decode()
        .catch(() => undefined)
        .then(() => {
          if (cancelled) return
          const next: 0 | 1 = frontRef.current === 0 ? 1 : 0
          setLayers((prev) => (next === 0 ? [src, prev[1]] : [prev[0], src]))
          frontRef.current = next
          setFront(next)
          setVisible(true)
        })
    }, SETTLE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [src])

  return (
    <div className={s.backdrop} aria-hidden="true">
      {layers.map((layer, i) => (
        <div key={i} className={s.backdropLayer} data-on={visible && front === i}>
          {layer && <img src={layer} alt="" decoding="async" draggable={false} data-variant={i} />}
        </div>
      ))}
      <div className={s.backdropShade} />
    </div>
  )
}
