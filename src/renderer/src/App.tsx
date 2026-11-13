import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import type { GameView } from '../../shared/types'
import { api } from './api'
import { Home } from './home/Home'
import { useAppState } from './hooks/useAppState'
import { inputManager } from './input/InputManager'
import { OverlayHost, RunningScreen, type Overlay } from './screens/Overlays'
import ui from './ui/ui.module.css'

const TOAST_MS = 3200

export function App(): ReactElement | null {
  const state = useAppState()
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const [reveal, setReveal] = useState<{ id: string; nonce: number } | null>(null)
  const greeted = useRef(false)

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

  const notify = useCallback((text: string) => setToast({ id: Date.now(), text }), [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  // Premier affichage : messages en attente, puis assistant si la bibliothèque est vide.
  useEffect(() => {
    if (!state || greeted.current) return
    greeted.current = true
    if (state.notices.length > 0) notify(state.notices.join(' · '))
    if (!state.onboarded && state.games.length === 0) setOverlay({ type: 'welcome' })
  }, [state, notify])

  const gameState = state?.gameState
  useEffect(() => {
    if (gameState?.status === 'error') notify(gameState.message)
  }, [gameState, notify])

  if (!state) return null

  const launch = (game: GameView): void => {
    void api.launchGame(game.id).then((result) => {
      if (!result.ok && !result.cancelled) notify(result.error)
    })
  }

  const shortcut = (id: string): void => {
    if (id === 'add') setOverlay({ type: 'add' })
    else notify('Bientôt disponible.')
  }

  const running = state.gameState.status === 'running' ? state.gameState.id : null

  return (
    <>
      <Home
        games={state.games}
        profiles={state.profiles}
        activeProfileId={state.activeProfile}
        reveal={reveal}
        onLaunch={launch}
        onAdd={() => setOverlay({ type: 'add' })}
        onOptions={(game) => setOverlay({ type: 'options', gameId: game.id })}
        onShortcut={shortcut}
        notify={notify}
      />
      {overlay && !running && (
        <OverlayHost
          overlay={overlay}
          state={state}
          open={setOverlay}
          notify={notify}
          reveal={(id) => setReveal({ id, nonce: Date.now() })}
        />
      )}
      {running && <RunningScreen game={state.games.find((g) => g.id === running)} />}
      {toast && (
        <div key={toast.id} className={ui.toast} role="status">
          {toast.text}
        </div>
      )}
    </>
  )
}
