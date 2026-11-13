import { cancelled, fail, type Api, type AppState } from '../../shared/types'
import { demoGames } from './demo/library'

const UNAVAILABLE = fail('Disponible uniquement dans l’application (npm run dev).')

/**
 * Fausse API pour ouvrir le rendu dans un simple navigateur (`npm run dev:web`) :
 * six jeux de démonstration, rien n'est lancé ni enregistré.
 */
export function createBrowserMock(): Api {
  const state: AppState = {
    games: demoGames,
    emulators: [{ id: 'fritchii', name: 'Fritchii', configured: false, exePath: '' }],
    profiles: [
      { id: 'p1', name: 'Alex', color: '#2f6fe0' },
      { id: 'p2', name: 'Invité', color: '#e0457b' }
    ],
    activeProfile: 'p1',
    onboarded: true,
    gameState: { status: 'idle' },
    notices: []
  }
  return {
    systemStatus: async () => ({ wifi: { ssid: 'Démo', signal: 82 }, battery: { percent: 76, charging: false } }),
    toggleFullscreen: async () => {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    },
    quit: async () => undefined,
    getState: async () => state,
    onState: () => () => undefined,
    setOnboarded: async () => undefined,
    addPcGame: async () => UNAVAILABLE,
    addEmulatedGame: async () => UNAVAILABLE,
    locateEmulator: async () => UNAVAILABLE,
    scanFolder: async () => cancelled(),
    importGames: async () => UNAVAILABLE,
    setGameArt: async () => UNAVAILABLE,
    removeGame: async () => UNAVAILABLE,
    launchGame: async () => UNAVAILABLE,
    stopGame: async () => undefined
  }
}
