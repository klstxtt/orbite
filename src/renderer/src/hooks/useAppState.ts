import { useEffect, useState } from 'react'
import type { AppState } from '../../../shared/types'
import { api } from '../api'

/** État complet de l'application, tenu à jour par le processus principal (null avant la première lecture). */
export function useAppState(): AppState | null {
  const [state, setState] = useState<AppState | null>(null)
  useEffect(() => {
    let alive = true
    const unsubscribe = api.onState((next) => {
      if (alive) setState(next)
    })
    void api.getState().then((first) => {
      if (alive) setState((current) => current ?? first)
    })
    return () => {
      alive = false
      unsubscribe()
    }
  }, [])
  return state
}
