import type { ReactElement } from 'react'
import type { AppState, ArtKind } from '../../../shared/types'
import { api } from '../api'
import { Menu } from '../ui/Menu'
import type { HostProps, Overlay } from './overlayTypes'

export type ArtOverlay = Extract<Overlay, { type: 'art' }>
export const isArtOverlay = (overlay: Overlay): overlay is ArtOverlay => overlay.type === 'art'

const KINDS: ReadonlyArray<{ id: ArtKind; name: string; hint: string }> = [
  { id: 'cover', name: 'Jaquette', hint: 'image carrée de préférence' },
  { id: 'hero', name: 'Image de fond', hint: '16:9, 3840×2160 idéalement' },
  { id: 'logo', name: 'Logo', hint: 'fond transparent de préférence' }
]

/** Images d'un jeu : jaquette, fond et logo, chacun choisi depuis un fichier. */
export function ArtHost({ overlay, state, open, notify }: HostProps<ArtOverlay> & { state: AppState }): ReactElement | null {
  const game = state.games.find((g) => g.id === overlay.gameId)
  if (!game) return null
  const current: Record<ArtKind, string | null> = { cover: game.cover, hero: game.hero, logo: game.logo }
  return (
    <Menu
      key="art"
      title="Images du jeu"
      subtitle={game.title}
      items={KINDS.map((k) => ({ id: k.id, label: `${k.name} : choisir un fichier…`, detail: current[k.id] ? 'image choisie' : k.hint }))}
      onBack={() => open({ type: 'options', gameId: game.id })}
      onSelect={(id) => {
        const kind = KINDS.find((k) => k.id === id)?.id
        if (!kind) return
        void api.setGameArt({ gameId: game.id, slot: kind }).then((result) => {
          if (result.ok) notify('Image enregistrée.')
          else if (!result.cancelled) notify(result.error)
        })
      }}
    />
  )
}
