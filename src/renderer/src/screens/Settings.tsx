import type { ReactElement } from 'react'
import type { Theme } from '../../../shared/schemas'
import { ACCENT_PRESETS, PROFILE_COLORS } from '../../../shared/themes'
import type { AppState, Result } from '../../../shared/types'
import { api } from '../api'
import { Menu } from '../ui/Menu'
import type { HostProps, Overlay } from './overlayTypes'

const COLOR_NAMES = ['Bleu', 'Rose', 'Vert', 'Orange', 'Violet', 'Rouge', 'Turquoise', 'Gris']
const CURSORS: ReadonlyArray<{ id: Theme['cursor']; name: string }> = [
  { id: 'anneau', name: 'Anneau animé' },
  { id: 'contour', name: 'Contour simple' },
  { id: 'lueur', name: 'Lueur' }
]
const SOUNDS: ReadonlyArray<{ id: Theme['sounds']; name: string }> = [
  { id: 'doux', name: 'Doux' },
  { id: 'retro', name: 'Rétro' },
  { id: 'muet', name: 'Muet' }
]
const yesNo = (value: boolean): string => (value ? 'oui' : 'non')
const nextOf = <T extends { id: string }>(list: readonly T[], current: string): T =>
  list[(list.findIndex((x) => x.id === current) + 1) % list.length] as T

type SettingsOverlay = Exclude<
  Overlay,
  { type: 'welcome' | 'add' | 'emulator' | 'emu-locate' | 'import' | 'options' | 'remove' | 'text' | 'art' }
>

/** Écrans des paramètres : profils, thèmes, son, affichage, système. */
export function SettingsHost({ overlay, state, open, notify }: HostProps<SettingsOverlay> & { state: AppState }): ReactElement | null {
  const { settings } = state

  /** Attend une action ; affiche son erreur (sauf annulation) et renvoie vrai si elle a réussi. */
  const done = async <T,>(promise: Promise<Result<T>>, success?: string): Promise<boolean> => {
    const result = await promise
    if (result.ok) {
      if (success) notify(success)
    } else if (!result.cancelled) notify(result.error)
    return result.ok
  }
  const set = (patch: Parameters<typeof api.updateSettings>[0]): void => void done(api.updateSettings(patch))
  const ask = (title: string, initial: string, max: number, submit: (text: string) => void): void =>
    open({ type: 'text', title, initial, max, back: overlay, submit })

  switch (overlay.type) {
    case 'settings':
      return (
        <Menu
          key="settings"
          title="Paramètres"
          items={[
            { id: 'profiles', label: 'Profils', detail: `${state.profiles.length}` },
            { id: 'themes', label: 'Thèmes', detail: state.themes.find((t) => t.id === state.activeTheme)?.name },
            { id: 'sound', label: 'Son' },
            { id: 'display', label: 'Affichage et manette' },
            { id: 'add', label: 'Ajouter un jeu' },
            { id: 'emulators', label: 'Émulateurs', detail: `${state.emulators.length}` },
            { id: 'system', label: 'Système' }
          ]}
          onBack={() => open(null)}
          onSelect={(id) => open({ type: id } as Overlay)}
        />
      )

    case 'sound': {
      const volume = (delta: number): void => set({ sfxVolume: Math.max(0, Math.min(100, settings.sfxVolume + delta)) })
      return (
        <Menu
          key="sound"
          title="Son"
          subtitle="Gauche et droite règlent le volume."
          items={[
            { id: 'volume', label: 'Volume des effets', detail: `◀ ${settings.sfxVolume} % ▶` },
            { id: 'muted', label: 'Couper tous les sons', detail: yesNo(settings.muted) }
          ]}
          onBack={() => open({ type: 'settings' })}
          onAdjust={(id, delta) => id === 'volume' && volume(delta * 10)}
          onSelect={(id) => (id === 'muted' ? set({ muted: !settings.muted }) : volume(settings.sfxVolume >= 100 ? -100 : 10))}
        />
      )
    }

    case 'display':
      return (
        <Menu
          key="display"
          title="Affichage et manette"
          items={[
            { id: 'fullscreen', label: 'Plein écran', detail: yesNo(settings.fullscreen) },
            { id: 'backdrop', label: 'Fond de l’accueil', detail: settings.homeBackdrop === 'hero' ? 'image du jeu' : 'fond du thème' },
            { id: 'sort', label: 'Ordre des jeux', detail: settings.sortRecent ? 'joués récemment d’abord' : 'ordre d’ajout' },
            { id: 'accent', label: 'Contour à la couleur de la jaquette', detail: yesNo(settings.coverAccent) },
            { id: 'swap', label: 'Inverser A et B', detail: yesNo(settings.swapConfirm) },
            { id: 'rumble', label: 'Vibration à la validation', detail: yesNo(settings.rumble) }
          ]}
          onBack={() => open({ type: 'settings' })}
          onSelect={(id) => {
            if (id === 'fullscreen') set({ fullscreen: !settings.fullscreen })
            else if (id === 'backdrop') set({ homeBackdrop: settings.homeBackdrop === 'hero' ? 'theme' : 'hero' })
            else if (id === 'sort') set({ sortRecent: !settings.sortRecent })
            else if (id === 'accent') set({ coverAccent: !settings.coverAccent })
            else if (id === 'rumble') set({ rumble: !settings.rumble })
            else set({ swapConfirm: !settings.swapConfirm })
          }}
        />
      )

    case 'system':
      return (
        <Menu
          key="system"
          title="Système"
          items={[
            { id: 'autostart', label: 'Démarrer avec Windows', detail: yesNo(settings.autoStart) },
            { id: 'sleep', label: 'Mettre l’ordinateur en veille' },
            { id: 'quit', label: 'Quitter le lanceur' }
          ]}
          onBack={() => open({ type: 'settings' })}
          onSelect={(id) => {
            if (id === 'autostart') set({ autoStart: !settings.autoStart })
            else if (id === 'sleep') void api.sleep()
            else void api.quit()
          }}
        />
      )

    case 'power':
      return (
        <Menu
          key="power"
          title="Mise en veille"
          items={[
            { id: 'sleep', label: 'Mettre l’ordinateur en veille' },
            { id: 'quit', label: 'Quitter le lanceur' },
            { id: 'cancel', label: 'Annuler' }
          ]}
          onBack={() => open(null)}
          onSelect={(id) => {
            if (id === 'sleep') void api.sleep()
            else if (id === 'quit') void api.quit()
            open(null)
          }}
        />
      )

    case 'emulators':
      return (
        <Menu
          key="emulators"
          title="Émulateurs"
          subtitle="Choisis un émulateur pour indiquer où se trouve son programme."
          items={state.emulators.map((e) => ({ id: e.id, label: e.name, detail: e.configured ? e.exePath : 'à localiser' }))}
          onBack={() => open({ type: 'settings' })}
          onSelect={(id) => void done(api.locateEmulator(id), 'Émulateur enregistré.')}
        />
      )

    // ---------- Profils ----------

    case 'profiles':
      return (
        <Menu
          key="profiles"
          title="Profils"
          subtitle="Chaque profil a son propre temps de jeu."
          items={[
            ...state.profiles.map((p) => ({ id: p.id, label: p.name, swatch: p.color, detail: p.id === state.activeProfile ? 'actif' : undefined })),
            { id: ':new', label: 'Nouveau profil…' }
          ]}
          onBack={() => open({ type: 'settings' })}
          onSelect={(id) => {
            if (id !== ':new') {
              open({ type: 'profile', id })
              return
            }
            ask('Nom du profil', '', 24, (name) => {
              void api.profileAction({ type: 'create', name }).then((result) => {
                if (result.ok) open({ type: 'profile', id: result.value })
                else {
                  notify(result.error)
                  open({ type: 'profiles' })
                }
              })
            })
          }}
        />
      )

    case 'profile': {
      const profile = state.profiles.find((p) => p.id === overlay.id)
      if (!profile) return null
      const act = (type: 'activate' | 'pickAvatar' | 'clearAvatar', success: string): void =>
        void done(api.profileAction({ type, id: profile.id }), success)
      return (
        <Menu
          key={`profile-${profile.id}`}
          title={profile.name}
          items={[
            { id: 'use', label: 'Utiliser ce profil', detail: profile.id === state.activeProfile ? 'actif' : undefined },
            { id: 'rename', label: 'Renommer…' },
            { id: 'color', label: 'Couleur', swatch: profile.color },
            { id: 'avatar', label: 'Choisir une image…', detail: profile.avatar ? 'image choisie' : 'aucune' },
            ...(profile.avatar ? [{ id: 'clear', label: 'Retirer l’image' }] : []),
            ...(state.profiles.length > 1 ? [{ id: 'delete', label: 'Supprimer le profil', tone: 'danger' as const }] : [])
          ]}
          onBack={() => open({ type: 'profiles' })}
          onSelect={(id) => {
            if (id === 'use') act('activate', `Profil actif : ${profile.name}`)
            else if (id === 'avatar') act('pickAvatar', 'Image enregistrée.')
            else if (id === 'clear') act('clearAvatar', 'Image retirée.')
            else if (id === 'color') open({ type: 'profile-color', id: profile.id })
            else if (id === 'delete') open({ type: 'profile-delete', id: profile.id })
            else {
              ask('Nom du profil', profile.name, 24, (name) => {
                void done(api.profileAction({ type: 'rename', id: profile.id, name })).then(() => open({ type: 'profile', id: profile.id }))
              })
            }
          }}
        />
      )
    }

    case 'profile-color':
      return (
        <Menu
          key="profile-color"
          title="Couleur du profil"
          items={PROFILE_COLORS.map((color, i) => ({ id: color, label: COLOR_NAMES[i] ?? color, swatch: color }))}
          onBack={() => open({ type: 'profile', id: overlay.id })}
          onSelect={(color) => {
            void done(api.profileAction({ type: 'color', id: overlay.id, color })).then(() => open({ type: 'profile', id: overlay.id }))
          }}
        />
      )

    case 'profile-delete': {
      const profile = state.profiles.find((p) => p.id === overlay.id)
      if (!profile) return null
      return (
        <Menu
          key="profile-delete"
          title={`Supprimer « ${profile.name} » ?`}
          subtitle="Son temps de jeu sera effacé. Les jeux restent dans la bibliothèque."
          items={[
            { id: 'cancel', label: 'Annuler' },
            { id: 'delete', label: 'Supprimer', tone: 'danger' }
          ]}
          onBack={() => open({ type: 'profile', id: profile.id })}
          onSelect={(id) => {
            if (id === 'cancel') open({ type: 'profile', id: profile.id })
            else void done(api.profileAction({ type: 'delete', id: profile.id }), 'Profil supprimé.').then(() => open({ type: 'profiles' }))
          }}
        />
      )
    }

    // ---------- Thèmes ----------

    case 'themes':
      return (
        <Menu
          key="themes"
          title="Thèmes"
          items={[
            ...state.themes.map((t) => ({
              id: t.id,
              label: t.name,
              swatch: `linear-gradient(135deg, ${t.colors.accentA}, ${t.colors.accentC})`,
              detail: t.id === state.activeTheme ? 'actif' : t.builtin ? 'fourni' : 'personnel'
            })),
            { id: ':import', label: 'Importer un thème…' }
          ]}
          onBack={() => open({ type: 'settings' })}
          onSelect={(id) => {
            if (id === ':import') void done(api.themeAction({ type: 'import' }), 'Thème importé et activé.')
            else open({ type: 'theme', id })
          }}
        />
      )

    case 'theme': {
      const theme = state.themes.find((t) => t.id === overlay.id)
      if (!theme) return null
      const active = theme.id === state.activeTheme
      const update = (patch: Extract<Parameters<typeof api.themeAction>[0], { type: 'update' }>['patch']): void =>
        void done(api.themeAction({ type: 'update', id: theme.id, patch }))
      const common = [
        { id: 'use', label: 'Utiliser ce thème', detail: active ? 'actif' : undefined },
        { id: 'export', label: 'Exporter…' }
      ]
      const editing = theme.builtin
        ? [{ id: 'copy', label: 'Personnaliser (créer une copie)…' }]
        : [
            { id: 'wallpaper', label: 'Fond d’écran…', detail: theme.wallpaperUrl ? 'image choisie' : 'aucun' },
            ...(theme.wallpaperUrl ? [{ id: 'clear', label: 'Retirer le fond d’écran' }] : []),
            { id: 'accent', label: 'Couleurs d’accent', swatch: `linear-gradient(135deg, ${theme.colors.accentA}, ${theme.colors.accentC})` },
            { id: 'scheme', label: 'Base', detail: theme.scheme === 'dark' ? 'sombre' : 'claire' },
            { id: 'cursor', label: 'Curseur', detail: CURSORS.find((c) => c.id === theme.cursor)?.name },
            { id: 'sounds', label: 'Sons', detail: SOUNDS.find((x) => x.id === theme.sounds)?.name },
            { id: 'rename', label: 'Renommer…' },
            { id: 'delete', label: 'Supprimer le thème', tone: 'danger' as const }
          ]
      return (
        <Menu
          key={`theme-${theme.id}`}
          title={theme.name}
          subtitle={theme.builtin ? 'Thème fourni avec le lanceur.' : active ? undefined : 'Active ce thème pour voir tes changements.'}
          items={[...common, ...editing]}
          onBack={() => open({ type: 'themes' })}
          onSelect={(id) => {
            if (id === 'use') void done(api.themeAction({ type: 'activate', id: theme.id }), `Thème actif : ${theme.name}`)
            else if (id === 'export') {
              void api.themeAction({ type: 'export', id: theme.id }).then((result) => {
                if (result.ok) notify(`Thème exporté : ${result.value}`)
                else if (!result.cancelled) notify(result.error)
              })
            } else if (id === 'copy') {
              ask('Nom du nouveau thème', `${theme.name} perso`, 40, (name) => {
                void api.themeAction({ type: 'create', name, fromId: theme.id }).then((result) => {
                  if (result.ok) open({ type: 'theme', id: result.value })
                  else {
                    notify(result.error)
                    open({ type: 'themes' })
                  }
                })
              })
            } else if (id === 'wallpaper') void done(api.themeAction({ type: 'pickWallpaper', id: theme.id }), 'Fond d’écran enregistré.')
            else if (id === 'clear') void done(api.themeAction({ type: 'clearWallpaper', id: theme.id }))
            else if (id === 'accent') open({ type: 'theme-accent', id: theme.id })
            else if (id === 'scheme') update({ scheme: theme.scheme === 'dark' ? 'light' : 'dark' })
            else if (id === 'cursor') update({ cursor: nextOf(CURSORS, theme.cursor).id })
            else if (id === 'sounds') update({ sounds: nextOf(SOUNDS, theme.sounds).id })
            else if (id === 'delete') open({ type: 'theme-delete', id: theme.id })
            else if (id === 'rename') {
              ask('Nom du thème', theme.name, 40, (name) => {
                void done(api.themeAction({ type: 'update', id: theme.id, patch: { name } })).then(() => open({ type: 'theme', id: theme.id }))
              })
            }
          }}
        />
      )
    }

    case 'theme-accent':
      return (
        <Menu
          key="theme-accent"
          title="Couleurs d’accent"
          subtitle="Dégradé du contour de sélection."
          items={ACCENT_PRESETS.map((p) => ({ id: p.id, label: p.name, swatch: `linear-gradient(135deg, ${p.a}, ${p.b}, ${p.c})` }))}
          onBack={() => open({ type: 'theme', id: overlay.id })}
          onSelect={(id) => {
            const preset = ACCENT_PRESETS.find((p) => p.id === id)
            if (!preset) return
            void done(api.themeAction({ type: 'update', id: overlay.id, patch: { accent: { a: preset.a, b: preset.b, c: preset.c } } })).then(() =>
              open({ type: 'theme', id: overlay.id })
            )
          }}
        />
      )

    case 'theme-delete': {
      const theme = state.themes.find((t) => t.id === overlay.id)
      if (!theme) return null
      return (
        <Menu
          key="theme-delete"
          title={`Supprimer « ${theme.name} » ?`}
          subtitle="Le thème et son fond d’écran seront effacés."
          items={[
            { id: 'cancel', label: 'Annuler' },
            { id: 'delete', label: 'Supprimer', tone: 'danger' }
          ]}
          onBack={() => open({ type: 'theme', id: theme.id })}
          onSelect={(id) => {
            if (id === 'cancel') open({ type: 'theme', id: theme.id })
            else void done(api.themeAction({ type: 'delete', id: theme.id }), 'Thème supprimé.').then(() => open({ type: 'themes' }))
          }}
        />
      )
    }
  }
}
