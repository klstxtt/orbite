import { useEffect, type ReactElement } from 'react'
import { api } from './api'
import { demoGames, demoProfiles } from './demo/library'
import { Home } from './home/Home'
import { inputManager } from './input/InputManager'

export function App(): ReactElement {
  useEffect(() => inputManager.start(), [])

  // F11 : bascule plein écran (utile en développement).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'F11') return
      e.preventDefault()
      void api.toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return <Home games={demoGames} profiles={demoProfiles} />
}
