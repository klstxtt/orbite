import type { Api } from '../../shared/types'
import { createBrowserMock } from './devMock'

declare global {
  interface Window {
    api?: Api
  }
}

/** L'API du preload dans l'application ; une fausse API quand le rendu tourne dans un navigateur. */
export const api: Api = window.api ?? createBrowserMock()
