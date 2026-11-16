import type { ReactElement } from 'react'
import type { ScanRequest } from '../../../shared/schemas'
import type { AppState, GameView, Result } from '../../../shared/types'
import { api } from '../api'
import { sfx } from '../audio/sfx'
import { useInput } from '../input/useInput'
import { Menu, type MenuItem } from '../ui/Menu'
import { TextInput } from '../ui/TextInput'
import { ArtHost, isArtOverlay, type ArtOverlay } from './Art'
import type { HostProps, Overlay } from './overlayTypes'
import { SettingsHost } from './Settings'
import s from '../ui/ui.module.css'

export type { Overlay } from './overlayTypes'

type LibraryOverlay = Extract<Overlay, { type: 'welcome' | 'add' | 'emulator' | 'emu-locate' | 'import' | 'options' | 'remove' }>
const LIBRARY_TYPES: ReadonlySet<string> = new Set(['welcome', 'add', 'emulator', 'emu-locate', 'import', 'options', 'remove'])
const isLibrary = (overlay: Exclude<Overlay, { type: 'text' } | ArtOverlay>): overlay is LibraryOverlay => LIBRARY_TYPES.has(overlay.type)

interface Props extends HostProps {
  state: AppState
  /** Amène la sélection de l'accueil sur ce jeu. */
  reveal: (gameId: string) => void
  launch: (game: GameView) => void
}

const ADD_ITEMS: readonly MenuItem[] = [
  { id: 'pc', label: 'Jeu PC', detail: 'un programme .exe' },
  { id: 'emu', label: 'Jeu sur émulateur', detail: 'émulateur + fichier du jeu' },
  { id: 'folder-pc', label: 'Importer un dossier de jeux PC' },
  { id: 'folder-emu', label: 'Importer un dossier de jeux d’émulateur' }
]

export function formatPlaytime(seconds: number): string {
  if (seconds < 60) return seconds > 0 ? 'moins d’une minute' : 'jamais joué'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${minutes} min`
}

const SESSION_DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

/** Colonne de gauche de la fiche d'un jeu : jaquette et chiffres. */
function SheetAside({ game }: { game: GameView }): ReactElement {
  const session =
    game.lastPlayed > 0
      ? `${SESSION_DATE.format(game.lastPlayed)}${game.lastSession >= 60 ? ` · ${formatPlaytime(game.lastSession)}` : ''}`
      : 'jamais'
  return (
    <>
      <div className={s.sheetCover}>{game.cover ? <img src={game.cover} alt="" draggable={false} /> : game.title}</div>
      <dl className={s.sheetFacts}>
        <div>
          <dt>Temps de jeu</dt>
          <dd>{formatPlaytime(game.playtime)}</dd>
        </div>
        <div>
          <dt>Dernière session</dt>
          <dd>{session}</dd>
        </div>
        <div>
          <dt>Plateforme</dt>
          <dd>{game.available ? game.platform : `${game.platform} · fichier introuvable`}</dd>
        </div>
      </dl>
    </>
  )
}

export function OverlayHost({ overlay, state, open, notify, reveal, launch }: Props): ReactElement | null {
  /** Affiche l'erreur d'un résultat (sauf annulation) ; renvoie vrai si tout s'est bien passé. */
  const succeeded = <T,>(result: Result<T>): result is { ok: true; value: T } => {
    if (!result.ok && !result.cancelled) notify(result.error)
    return result.ok
  }

  const addPc = async (): Promise<void> => {
    const result = await api.addPcGame()
    if (!succeeded(result)) return
    open(null)
    reveal(result.value)
    notify('Jeu ajouté. Options (+) pour lui donner une jaquette.')
  }

  const addEmulated = async (emulatorId: string): Promise<void> => {
    const result = await api.addEmulatedGame(emulatorId)
    if (!succeeded(result)) return
    open(null)
    reveal(result.value)
    notify('Jeu ajouté. Options (+) pour lui donner une jaquette.')
  }

  const scan = async (request: ScanRequest): Promise<void> => {
    const result = await api.scanFolder(request)
    if (!succeeded(result)) return
    const { dir, candidates } = result.value
    if (candidates.length === 0) {
      notify('Aucun nouveau jeu trouvé dans ce dossier.')
      return
    }
    open({ type: 'import', request, dir, candidates, checked: new Set(candidates.map((c) => c.path)) })
  }

  /** Ajoute un fichier ou importe un dossier ; si l'émulateur n'est pas encore localisé, on l'explique d'abord. */
  const withChosenEmulator = (emulatorId: string, then: 'file' | 'folder'): void => {
    const emulator = state.emulators.find((e) => e.id === emulatorId)
    if (emulator && !emulator.configured) open({ type: 'emu-locate', emulatorId, then })
    else if (then === 'file') void addEmulated(emulatorId)
    else void scan({ kind: 'emulated', emulatorId })
  }

  /** Avec un seul émulateur connu, inutile de demander lequel. */
  const withEmulator = (then: 'file' | 'folder'): void => {
    const only = state.emulators.length === 1 ? state.emulators[0] : undefined
    if (state.emulators.length === 0) notify('Aucun profil d’émulateur disponible.')
    else if (!only) open({ type: 'emulator', then })
    else withChosenEmulator(only.id, then)
  }

  const chooseAdd = (id: string): void => {
    if (id === 'pc') void addPc()
    else if (id === 'emu') withEmulator('file')
    else if (id === 'folder-pc') void scan({ kind: 'pc' })
    else if (id === 'folder-emu') withEmulator('folder')
  }

  if (overlay.type === 'text') {
    return (
      <TextInput
        key={overlay.title}
        title={overlay.title}
        initial={overlay.initial}
        max={overlay.max}
        onSubmit={overlay.submit}
        onCancel={() => open(overlay.back)}
      />
    )
  }
  if (isArtOverlay(overlay)) return <ArtHost overlay={overlay} state={state} open={open} notify={notify} />
  if (!isLibrary(overlay)) return <SettingsHost overlay={overlay} state={state} open={open} notify={notify} />

  switch (overlay.type) {
    case 'welcome': {
      const finish = (): void => {
        void api.setOnboarded()
        open(null)
      }
      return (
        <Menu
          key="welcome"
          title="Bienvenue"
          subtitle="La bibliothèque est vide. Ajoute un premier jeu : le lanceur démarre tes propres jeux, il n'en contient aucun."
          items={[...ADD_ITEMS, { id: 'later', label: 'Plus tard' }]}
          onBack={finish}
          onSelect={(id) => {
            void api.setOnboarded()
            if (id === 'later') open(null)
            else chooseAdd(id)
          }}
        />
      )
    }

    case 'add':
      return <Menu key="add" title="Ajouter un jeu" items={ADD_ITEMS} onBack={() => open(null)} onSelect={chooseAdd} />

    case 'emulator':
      return (
        <Menu
          key="emulator"
          title="Quel émulateur ?"
          items={state.emulators.map((e) => ({ id: e.id, label: e.name, detail: e.configured ? e.exePath : 'à localiser' }))}
          onBack={() => open({ type: 'add' })}
          onSelect={(id) => withChosenEmulator(id, overlay.then)}
        />
      )

    case 'emu-locate': {
      const emulator = state.emulators.find((e) => e.id === overlay.emulatorId)
      const name = emulator?.name ?? 'l’émulateur'
      const next = overlay.then === 'folder' ? 'Ensuite, tu choisiras le dossier de tes jeux.' : 'Ensuite, tu choisiras le fichier du jeu.'
      return (
        <Menu
          key="emu-locate"
          title={`Où est ${name} ?`}
          subtitle={`Orbite ne sait pas encore où ${name} est installé sur ce PC. D’abord, choisis le programme de l’émulateur (son fichier .exe). ${next}`}
          items={[
            { id: 'locate', label: 'Choisir le programme de l’émulateur…' },
            { id: 'back', label: 'Retour' }
          ]}
          onBack={() => open({ type: 'add' })}
          onSelect={(id) => {
            if (id === 'back') {
              open({ type: 'add' })
              return
            }
            void api.locateEmulator(overlay.emulatorId).then((result) => {
              if (!succeeded(result)) return
              notify(`${name} trouvé.`)
              if (overlay.then === 'file') void addEmulated(overlay.emulatorId)
              else void scan({ kind: 'emulated', emulatorId: overlay.emulatorId })
            })
          }}
        />
      )
    }

    case 'import': {
      const { candidates, checked, request } = overlay
      const allChecked = checked.size === candidates.length
      const toggle = (path: string): void => {
        const next = new Set(checked)
        if (!next.delete(path)) next.add(path)
        open({ ...overlay, checked: next })
      }
      const run = async (): Promise<void> => {
        if (checked.size === 0) {
          notify('Aucun jeu coché.')
          return
        }
        const paths = candidates.filter((c) => checked.has(c.path)).map((c) => c.path)
        const result = await api.importGames(request.kind === 'pc' ? { kind: 'pc', paths } : { ...request, paths })
        if (!succeeded(result)) return
        open(null)
        notify(result.value > 1 ? `${result.value} jeux ajoutés.` : `${result.value} jeu ajouté.`)
      }
      return (
        <Menu
          key="import"
          title={`${candidates.length} jeu${candidates.length > 1 ? 'x' : ''} trouvé${candidates.length > 1 ? 's' : ''}`}
          subtitle={overlay.dir}
          items={[
            { id: ':go', label: `Importer la sélection (${checked.size})` },
            { id: ':all', label: allChecked ? 'Tout décocher' : 'Tout cocher' },
            ...candidates.map((c) => ({ id: c.path, label: c.title, check: checked.has(c.path) }))
          ]}
          onBack={() => open(null)}
          onSelect={(id) => {
            if (id === ':go') void run()
            else if (id === ':all') open({ ...overlay, checked: allChecked ? new Set() : new Set(candidates.map((c) => c.path)) })
            else toggle(id)
          }}
        />
      )
    }

    case 'options': {
      const game = state.games.find((g) => g.id === overlay.gameId)
      if (!game) return null
      return (
        <Menu
          key="options"
          title={game.title}
          aside={<SheetAside game={game} />}
          items={[
            { id: 'play', label: 'Démarrer' },
            { id: 'rename', label: 'Renommer…' },
            { id: 'art', label: 'Images…', detail: `${[game.cover, game.hero, game.logo].filter(Boolean).length} sur 3` },
            { id: 'args', label: 'Arguments de lancement…', detail: game.args || 'aucun' },
            ...(game.args ? [{ id: 'noargs', label: 'Effacer les arguments' }] : []),
            { id: 'remove', label: 'Retirer de la bibliothèque', tone: 'danger' }
          ]}
          onBack={() => open(null)}
          onSelect={(id) => {
            const setArgs = (args: string): Promise<void> =>
              api.setGameArgs({ gameId: game.id, args }).then((result) => {
                if (!result.ok && !result.cancelled) notify(result.error)
              })
            if (id === 'remove') open({ type: 'remove', gameId: game.id })
            else if (id === 'play') {
              open(null)
              launch(game)
            } else if (id === 'noargs') void setArgs('')
            else if (id === 'args') {
              open({
                type: 'text',
                title: 'Arguments de lancement',
                initial: game.args,
                max: 400,
                back: overlay,
                submit: (args) => void setArgs(args).then(() => open({ type: 'options', gameId: game.id }))
              })
            } else if (id === 'rename') {
              open({
                type: 'text',
                title: 'Titre du jeu',
                initial: game.title,
                max: 120,
                back: overlay,
                submit: (title) => {
                  void api.renameGame({ gameId: game.id, title }).then((result) => {
                    if (!result.ok && !result.cancelled) notify(result.error)
                    open({ type: 'options', gameId: game.id })
                  })
                }
              })
            } else open({ type: 'art', gameId: game.id })
          }}
        />
      )
    }

    case 'remove': {
      const game = state.games.find((g) => g.id === overlay.gameId)
      if (!game) return null
      return (
        <Menu
          key="remove"
          title={`Retirer « ${game.title} » ?`}
          subtitle="Le jeu disparaît du lanceur. Ses fichiers sur le disque ne sont pas touchés."
          items={[
            { id: 'cancel', label: 'Annuler' },
            { id: 'remove', label: 'Retirer', tone: 'danger' }
          ]}
          onBack={() => open({ type: 'options', gameId: game.id })}
          onSelect={(id) => {
            if (id === 'cancel') {
              open({ type: 'options', gameId: game.id })
              return
            }
            void api.removeGame(game.id).then((result) => {
              if (succeeded(result)) notify('Jeu retiré.')
              open(null)
            })
          }}
        />
      )
    }
  }
}

/** Écran affiché derrière le jeu tant qu'il tourne. B (ou Échap) arrête le jeu. */
export function RunningScreen({ game }: { game: GameView | undefined }): ReactElement {
  useInput((action) => {
    if (action !== 'back') return
    sfx.back()
    void api.stopGame()
  })
  return (
    <div className={s.running}>
      {game?.logo ? (
        <img className={s.runningLogo} src={game.logo} alt={game.title} draggable={false} />
      ) : (
        <div className={s.runningTitle}>{game?.title ?? 'Jeu en cours'}</div>
      )}
      <div className={s.runningHint}>En cours… B pour arrêter le jeu · Ctrl+Alt+Q depuis le jeu</div>
    </div>
  )
}
