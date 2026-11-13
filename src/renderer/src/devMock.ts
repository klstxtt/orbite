import { BUILTIN_THEMES, PROFILE_COLORS, SCHEME_BASE } from '../../shared/themes'
import { cancelled, fail, ok, type Api, type AppState, type ThemeView } from '../../shared/types'
import { demoGames } from './demo/library'

const UNAVAILABLE = fail('Disponible uniquement dans l’application (npm run dev).')

/**
 * Fausse API pour ouvrir le rendu dans un simple navigateur (`npm run dev:web`) : six jeux de
 * démonstration, rien n'est lancé ni enregistré. Profils, thèmes et réglages vivent en mémoire,
 * ce qui permet d'essayer les écrans de paramètres.
 */
export function createBrowserMock(): Api {
  let state: AppState = {
    games: demoGames,
    emulators: [{ id: 'fritchii', name: 'Fritchii', configured: false, exePath: '' }],
    profiles: [
      { id: 'p1', name: 'Alex', color: '#2f6fe0', avatar: null },
      { id: 'p2', name: 'Invité', color: '#e0457b', avatar: null }
    ],
    activeProfile: 'p1',
    settings: { sfxVolume: 70, muted: false, swapConfirm: false, fullscreen: false, homeBackdrop: 'hero', autoStart: false, coverAccent: true, sortRecent: true },
    themes: BUILTIN_THEMES.map((t) => ({ ...t, builtin: true, wallpaperUrl: null })),
    activeTheme: 'sombre',
    onboarded: true,
    gameState: { status: 'idle' },
    notices: []
  }
  const listeners = new Set<(s: AppState) => void>()
  const commit = (next: AppState): void => {
    state = next
    for (const listener of listeners) listener(state)
  }
  const editTheme = (id: string, change: (t: ThemeView) => ThemeView): void =>
    commit({ ...state, themes: state.themes.map((t) => (t.id === id ? change(t) : t)) })

  return {
    systemStatus: async () => ({ wifi: { ssid: 'Démo', signal: 82 }, battery: { percent: 76, charging: false } }),
    toggleFullscreen: async () => {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    },
    quit: async () => undefined,
    getState: async () => state,
    onState: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    setOnboarded: async () => undefined,
    addPcGame: async () => UNAVAILABLE,
    addEmulatedGame: async () => UNAVAILABLE,
    locateEmulator: async () => UNAVAILABLE,
    scanFolder: async () => cancelled(),
    importGames: async () => UNAVAILABLE,
    setGameArt: async () => UNAVAILABLE,
    removeGame: async () => UNAVAILABLE,
    renameGame: async ({ gameId, title }) => {
      commit({ ...state, games: state.games.map((g) => (g.id === gameId ? { ...g, title } : g)) })
      return ok(null)
    },

    updateSettings: async (patch) => {
      commit({ ...state, settings: { ...state.settings, ...patch } })
      return ok(null)
    },
    profileAction: async (action) => {
      if (action.type === 'pickAvatar' || action.type === 'clearAvatar') return UNAVAILABLE
      if (action.type === 'create') {
        const id = `p${Date.now()}`
        const color = PROFILE_COLORS[state.profiles.length % PROFILE_COLORS.length] ?? '#2f6fe0'
        commit({ ...state, profiles: [...state.profiles, { id, name: action.name, color, avatar: null }] })
        return ok(id)
      }
      if (action.type === 'delete') {
        const profiles = state.profiles.filter((p) => p.id !== action.id)
        if (profiles.length === 0) return fail('Il faut garder au moins un profil.')
        const activeProfile = state.activeProfile === action.id ? (profiles[0]?.id ?? '') : state.activeProfile
        commit({ ...state, profiles, activeProfile })
      } else if (action.type === 'activate') commit({ ...state, activeProfile: action.id })
      else {
        const patch = action.type === 'rename' ? { name: action.name } : { color: action.color }
        commit({ ...state, profiles: state.profiles.map((p) => (p.id === action.id ? { ...p, ...patch } : p)) })
      }
      return ok(action.id)
    },
    themeAction: async (action) => {
      switch (action.type) {
        case 'activate':
          commit({ ...state, activeTheme: action.id })
          return ok(action.id)
        case 'create': {
          const source = state.themes.find((t) => t.id === action.fromId) ?? state.themes[0]
          if (!source) return UNAVAILABLE
          const id = `perso-${Date.now()}`
          commit({ ...state, themes: [...state.themes, { ...source, id, name: action.name, builtin: false }], activeTheme: id })
          return ok(id)
        }
        case 'update': {
          const { patch } = action
          editTheme(action.id, (t) => ({
            ...t,
            name: patch.name ?? t.name,
            scheme: patch.scheme ?? t.scheme,
            cursor: patch.cursor ?? t.cursor,
            sounds: patch.sounds ?? t.sounds,
            colors: {
              ...t.colors,
              ...(patch.scheme ? SCHEME_BASE[patch.scheme] : {}),
              ...(patch.accent ? { accentA: patch.accent.a, accentB: patch.accent.b, accentC: patch.accent.c } : {})
            }
          }))
          return ok(action.id)
        }
        case 'delete':
          commit({
            ...state,
            themes: state.themes.filter((t) => t.id !== action.id),
            activeTheme: state.activeTheme === action.id ? 'sombre' : state.activeTheme
          })
          return ok(action.id)
        default:
          return UNAVAILABLE
      }
    },
    sleep: async () => undefined,

    launchGame: async () => UNAVAILABLE,
    stopGame: async () => undefined
  }
}
