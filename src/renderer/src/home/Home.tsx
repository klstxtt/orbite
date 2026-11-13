import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { GameView } from '../../../shared/types'
import { sfx } from '../audio/sfx'
import type { ProfileView } from '../demo/library'
import { useGamepadConnected } from '../hooks/useSystem'
import type { Action } from '../input/actions'
import { useInput } from '../input/useInput'
import { Backdrop } from './Backdrop'
import { ButtonHints, type Hint } from './ButtonHints'
import { GameRow } from './GameRow'
import { GamepadIcon } from './icons'
import { SHORTCUTS, ShortcutBar } from './ShortcutBar'
import { TopBar } from './TopBar'
import s from './home.module.css'

type Zone = 'profiles' | 'row' | 'bar'

/** Cases « Cartouche vide » affichées après le dernier jeu. */
const EMPTY_SLOTS = 3
const TOAST_MS = 2200

const HINTS: Record<'game' | 'empty' | 'bar' | 'profiles', readonly Hint[]> = {
  game: [
    { glyph: '+', label: 'Options' },
    { glyph: 'A', label: 'Démarrer' }
  ],
  empty: [{ glyph: 'A', label: 'Ajouter un jeu' }],
  bar: [{ glyph: 'A', label: 'OK' }],
  profiles: [{ glyph: 'A', label: 'Choisir' }]
}

interface Props {
  games: readonly GameView[]
  profiles: readonly ProfileView[]
}

export function Home({ games, profiles }: Props): ReactElement {
  const [zone, setZone] = useState<Zone>('row')
  const [gameIndex, setGameIndex] = useState(0)
  const [barIndex, setBarIndex] = useState(0)
  const [profileIndex, setProfileIndex] = useState(0)
  const [activeProfile, setActiveProfile] = useState(0)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const padConnected = useGamepadConnected()

  const slots = useMemo<ReadonlyArray<GameView | null>>(
    () => [...games, ...Array.from({ length: EMPTY_SLOTS }, () => null)],
    [games]
  )
  const game = slots[gameIndex] ?? null

  const notify = useCallback((text: string) => setToast({ id: Date.now(), text }), [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  /** Déplace un curseur d'un cran ; au bord, un son sourd et rien ne bouge. */
  const step = (current: number, delta: number, count: number, set: (n: number) => void): void => {
    const next = current + delta
    if (next < 0 || next >= count) {
      sfx.edge()
      return
    }
    set(next)
    sfx.move()
  }

  const goTo = (next: Zone): void => {
    setZone(next)
    sfx.move()
  }

  useInput((action: Action) => {
    const delta = action === 'left' ? -1 : action === 'right' ? 1 : 0

    if (zone === 'row') {
      if (delta) step(gameIndex, delta, slots.length, setGameIndex)
      else if (action === 'down') goTo('bar')
      else if (action === 'up') goTo('profiles')
      else if (action === 'confirm') {
        sfx.confirm()
        notify(game ? `Lancement de « ${game.title} » : disponible à l'étape 2` : 'Ajouter un jeu : disponible à l’étape 2')
      } else if ((action === 'options' || action === 'menu') && game) {
        sfx.confirm()
        notify(`Options de « ${game.title} » : disponibles à l'étape 5`)
      }
      return
    }

    if (zone === 'bar') {
      if (delta) step(barIndex, delta, SHORTCUTS.length, setBarIndex)
      else if (action === 'up' || action === 'back') {
        setZone('row')
        if (action === 'back') sfx.back()
        else sfx.move()
      } else if (action === 'confirm') {
        sfx.confirm()
        notify(`${SHORTCUTS[barIndex]?.label ?? ''} : bientôt disponible`)
      }
      return
    }

    // Zone des profils.
    if (delta) step(profileIndex, delta, profiles.length, setProfileIndex)
    else if (action === 'down' || action === 'back') {
      setZone('row')
      if (action === 'back') sfx.back()
      else sfx.move()
    } else if (action === 'confirm') {
      sfx.confirm()
      setActiveProfile(profileIndex)
      setZone('row')
    }
  })

  const hints = zone === 'bar' ? HINTS.bar : zone === 'profiles' ? HINTS.profiles : game ? HINTS.game : HINTS.empty

  return (
    <div className={s.home}>
      <Backdrop src={game?.hero ?? null} />
      <TopBar
        profiles={profiles}
        activeProfile={activeProfile}
        focusedProfile={zone === 'profiles' ? profileIndex : -1}
        title={game?.title ?? 'Cartouche vide'}
      />
      <GameRow slots={slots} selected={gameIndex} focused={zone === 'row'} />
      <ShortcutBar selected={barIndex} focused={zone === 'bar'} />
      <div className={s.padState} data-on={padConnected} title={padConnected ? 'Manette branchée' : 'Aucune manette'}>
        <GamepadIcon />
      </div>
      <ButtonHints hints={hints} />
      {toast && (
        <div key={toast.id} className={s.toast} role="status">
          {toast.text}
        </div>
      )}
    </div>
  )
}
