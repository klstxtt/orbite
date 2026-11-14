import type { ReactElement } from 'react'
import type { AppState, ArtKind, Result } from '../../../shared/types'
import { api } from '../api'
import { ImagePicker } from '../ui/ImagePicker'
import { Menu } from '../ui/Menu'
import type { HostProps, Overlay } from './overlayTypes'

export type ArtOverlay = Extract<Overlay, { type: 'art' | 'art-match' | 'art-pick' | 'art-key' }>
const ART_TYPES: ReadonlySet<string> = new Set(['art', 'art-match', 'art-pick', 'art-key'])
export const isArtOverlay = (overlay: Overlay): overlay is ArtOverlay => ART_TYPES.has(overlay.type)

const KINDS: ReadonlyArray<{ id: ArtKind; name: string }> = [
  { id: 'cover', name: 'Jaquette' },
  { id: 'hero', name: 'Image de fond' },
  { id: 'logo', name: 'Logo' }
]
/** Grille de choix : vignettes par ligne et hauteur (vh), selon la forme des images. */
const GRID: Record<ArtKind, { columns: number; rowVh: number }> = {
  cover: { columns: 5, rowVh: 27 },
  hero: { columns: 2, rowVh: 22 },
  logo: { columns: 3, rowVh: 20 }
}

/** Images d'un jeu : recherche en ligne (SteamGridDB), choix d'un fichier, et réglage de la clé. */
export function ArtHost({ overlay, state, open, notify }: HostProps<ArtOverlay> & { state: AppState }): ReactElement | null {
  const succeeded = <T,>(result: Result<T>): result is { ok: true; value: T } => {
    if (!result.ok && !result.cancelled) notify(result.error)
    return result.ok
  }

  if (overlay.type === 'art-key') {
    const hasKey = state.settings.onlineArt
    const save = async (action: Parameters<typeof api.setArtKey>[0], success: string): Promise<void> => {
      if (succeeded(await api.setArtKey(action))) notify(success)
    }
    return (
      <Menu
        key="art-key"
        title="Images en ligne"
        subtitle={`Les images viennent de SteamGridDB, avec ta clé personnelle : compte gratuit sur steamgriddb.com, puis Préférences > API. La clé reste sur ce PC. État : ${hasKey ? 'clé enregistrée' : 'aucune clé'}.`}
        items={[
          { id: 'paste', label: 'Coller la clé depuis le presse-papiers' },
          { id: 'type', label: 'Taper la clé…' },
          ...(hasKey ? [{ id: 'clear', label: 'Effacer la clé', tone: 'danger' as const }] : [])
        ]}
        onBack={() => open(overlay.back)}
        onSelect={(id) => {
          if (id === 'paste') void save({ type: 'paste' }, 'Clé vérifiée et enregistrée.')
          else if (id === 'clear') void save({ type: 'clear' }, 'Clé effacée.')
          else {
            open({
              type: 'text',
              title: 'Clé SteamGridDB',
              initial: '',
              max: 128,
              back: overlay,
              submit: (key) => void save({ type: 'set', key }, 'Clé vérifiée et enregistrée.').then(() => open(overlay))
            })
          }
        }}
      />
    )
  }

  const game = state.games.find((g) => g.id === overlay.gameId)
  if (!game) return null
  const sheet: Overlay = { type: 'options', gameId: game.id }
  const menu: Overlay = { type: 'art', gameId: game.id }

  /** Cherche le jeu par son nom, puis montre les jeux trouvés. */
  const search = async (kind: ArtKind | 'auto', term: string): Promise<void> => {
    if (!state.settings.onlineArt) {
      notify('Il faut d’abord ta clé SteamGridDB.')
      open({ type: 'art-key', back: menu })
      return
    }
    notify('Recherche…')
    const result = await api.artSearch(term)
    if (!succeeded(result)) return
    if (result.value.length === 0) notify(`Aucun jeu trouvé pour « ${term} ».`)
    open({ type: 'art-match', gameId: game.id, kind, results: result.value })
  }

  switch (overlay.type) {
    case 'art': {
      const current: Record<ArtKind, string | null> = { cover: game.cover, hero: game.hero, logo: game.logo }
      return (
        <Menu
          key="art"
          title="Images du jeu"
          subtitle={game.title}
          items={[
            { id: 'auto', label: 'Tout trouver automatiquement', detail: 'en ligne' },
            ...KINDS.map((k) => ({ id: `web-${k.id}`, label: `${k.name} : choisir en ligne`, detail: current[k.id] ? 'image choisie' : 'aucune' })),
            ...KINDS.map((k) => ({ id: `file-${k.id}`, label: `${k.name} : choisir un fichier…` }))
          ]}
          onBack={() => open(sheet)}
          onSelect={(id) => {
            const kind = KINDS.find((k) => id.endsWith(`-${k.id}`))?.id
            if (id === 'auto') void search('auto', game.title)
            else if (kind && id.startsWith('web-')) void search(kind, game.title)
            else if (kind) {
              void api.setGameArt({ gameId: game.id, slot: kind }).then((result) => {
                if (succeeded(result)) notify('Image enregistrée.')
              })
            }
          }}
        />
      )
    }

    case 'art-match': {
      const { kind } = overlay
      const choose = async (sgdbId: number): Promise<void> => {
        if (kind === 'auto') {
          notify('Téléchargement des images…')
          const result = await api.artAuto({ gameId: game.id, sgdbId })
          if (!succeeded(result)) return
          notify(result.value > 1 ? `${result.value} images enregistrées.` : '1 image enregistrée.')
          open(sheet)
          return
        }
        const result = await api.artList({ sgdbId, kind })
        if (!succeeded(result)) return
        if (result.value.length === 0) notify('Aucune image proposée pour ce jeu.')
        else open({ type: 'art-pick', gameId: game.id, kind, images: result.value, back: overlay })
      }
      return (
        <Menu
          key="art-match"
          title="Quel jeu ?"
          subtitle={overlay.results.length > 0 ? 'Choisis le jeu qui correspond.' : 'Aucun résultat : essaie un autre nom.'}
          items={[
            ...overlay.results.map((r) => ({ id: String(r.id), label: r.name, detail: r.year ? String(r.year) : undefined })),
            { id: ':other', label: 'Chercher un autre nom…' }
          ]}
          onBack={() => open(menu)}
          onSelect={(id) => {
            if (id !== ':other') void choose(Number(id))
            else open({ type: 'text', title: 'Nom du jeu à chercher', initial: game.title, max: 120, back: overlay, submit: (term) => void search(kind, term) })
          }}
        />
      )
    }

    case 'art-pick': {
      const { kind } = overlay
      return (
        <ImagePicker
          key="art-pick"
          title={`${KINDS.find((k) => k.id === kind)?.name ?? 'Image'} : ${game.title}`}
          images={overlay.images}
          columns={GRID[kind].columns}
          rowVh={GRID[kind].rowVh}
          contain={kind === 'logo'}
          onBack={() => open(overlay.back)}
          onSelect={(image) => {
            notify('Téléchargement…')
            void api.artApply({ gameId: game.id, slot: kind, url: image.url }).then((result) => {
              if (!succeeded(result)) return
              notify('Image enregistrée.')
              open(sheet)
            })
          }}
        />
      )
    }
  }
}
