import { useEffect, useRef } from 'react'
import type { ActionHandler } from './actions'
import { inputManager } from './InputManager'

/**
 * Reçoit les actions de navigation tant que le composant est monté et `active`.
 * Le dernier écran monté passe devant les autres (pile).
 */
export function useInput(handler: ActionHandler, active = true): void {
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    if (!active) return
    return inputManager.push((action) => latest.current(action))
  }, [active])
}
