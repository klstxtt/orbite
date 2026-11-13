import type { Api } from '../../shared/types'

declare global {
  interface Window {
    api?: Api
  }
}

/** Valeurs factices quand le rendu tourne dans un simple navigateur (`npm run dev:web`). */
const browserFallback: Api = {
  systemStatus: async () => ({ wifi: { ssid: 'Démo', signal: 82 }, battery: { percent: 76, charging: false } }),
  toggleFullscreen: async () => {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  },
  quit: async () => undefined
}

export const api: Api = window.api ?? browserFallback
