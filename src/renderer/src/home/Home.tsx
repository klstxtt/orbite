import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { GameView, ProfileView } from '../../../shared/types'
import { sfx } from '../audio/sfx'
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
  activeProfileId: string
  /** Fond d'écran du thème, ou null. */
  wallpaper: string | null
  /** Vrai : l'image du jeu sélectionné passe avant le fond du thème. */
  preferHero: boolean
  /** Vrai : le contour de sélection prend la couleur de la jaquette. */
  coverAccent: boolean
  onActivateProfile: (profile: ProfileView) => void
  /** Jeu sur lequel amener la sélection (après un ajout) ; `nonce` change à chaque demande. */
  reveal: { id: string; nonce: number } | null
  onLaunch: (game: GameView) => void
  onAdd: () => void
  onOptions: (game: GameView) => void
  /** Raccourci de la barre du bas, par identifiant. */
  onShortcut: (id: string) => void
}

export function Home({
  games,
  profiles,
  activeProfileId,
  wallpaper,
  preferHero,
  coverAccent,
  reveal,
  onLaunch,
  onAdd,
  onOptions,
  onShortcut,
  onActivateProfile
}: Props): ReactElement {
  const [zone, setZone] = useState<Zone>('row')
  const [gameCursor, setGameCursor] = useState(0)
  const [barIndex, setBarIndex] = useState(0)
  const [profileIndex, setProfileIndex] = useState(0)
  const padConnected = useGamepadConnected()

  const slots = useMemo<ReadonlyArray<GameView | null>>(
    () => [...games, ...Array.from({ length: EMPTY_SLOTS }, () => null)],
    [games]
  )
  // La bibliothèque peut rétrécir (jeu retiré) : le curseur reste dans les bornes.
  const gameIndex = Math.min(gameCursor, slots.length - 1)
  const game = slots[gameIndex] ?? null

  useEffect(() => {
    if (!reveal) return
    const index = games.findIndex((g) => g.id === reveal.id)
    if (index >= 0) {
      setGameCursor(index)
      setZone('row')
    }
  }, [reveal, games])

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

  const leaveTo = (next: Zone, action: Action): void => {
    setZone(next)
    if (action === 'back') sfx.back()
    else sfx.move()
  }

  useInput((action: Action) => {
    const delta = action === 'left' ? -1 : action === 'right' ? 1 : 0

    if (zone === 'row') {
      if (delta) step(gameIndex, delta, slots.length, setGameCursor)
      else if (action === 'down') leaveTo('bar', action)
      else if (action === 'up') leaveTo('profiles', action)
      else if (action === 'confirm') {
        sfx.confirm()
        if (game) onLaunch(game)
        else onAdd()
      } else if ((action === 'options' || action === 'menu') && game) {
        sfx.confirm()
        onOptions(game)
      }
      return
    }

    if (zone === 'bar') {
      if (delta) step(barIndex, delta, SHORTCUTS.length, setBarIndex)
      else if (action === 'up' || action === 'back') leaveTo('row', action)
      else if (action === 'confirm') {
        sfx.confirm()
        onShortcut(SHORTCUTS[barIndex]?.id ?? '')
      }
      return
    }

    // Zone des profils.
    if (delta) step(profileIndex, delta, profiles.length, setProfileIndex)
    else if (action === 'down' || action === 'back') leaveTo('row', action)
    else if (action === 'confirm') {
      sfx.confirm()
      const profile = profiles[Math.min(profileIndex, profiles.length - 1)]
      if (profile) onActivateProfile(profile)
      setZone('row')
    }
  })

  const hints = zone === 'bar' ? HINTS.bar : zone === 'profiles' ? HINTS.profiles : game ? HINTS.game : HINTS.empty
  const activeProfile = Math.max(
    0,
    profiles.findIndex((p) => p.id === activeProfileId)
  )

  const backdrop = (preferHero ? game?.hero : null) ?? wallpaper

  return (
    <div className={s.home} data-backdrop={backdrop !== null}>
      <Backdrop src={backdrop} />
      <TopBar
        profiles={profiles}
        activeProfile={activeProfile}
        focusedProfile={zone === 'profiles' ? Math.min(profileIndex, profiles.length - 1) : -1}
        title={game?.title ?? 'Cartouche vide'}
      />
      <GameRow slots={slots} selected={gameIndex} focused={zone === 'row'} coverAccent={coverAccent} />
      <ShortcutBar selected={barIndex} focused={zone === 'bar'} />
      <div className={s.padState} data-on={padConnected} title={padConnected ? 'Manette branchée' : 'Aucune manette'}>
        <GamepadIcon />
      </div>
      <ButtonHints hints={hints} />
    </div>
  )
}
