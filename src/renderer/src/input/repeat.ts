import { DIRECTIONS, type Action } from './actions'

export const FIRST_REPEAT_MS = 350
export const REPEAT_MS = 110

/**
 * Transforme « quelles actions sont enfoncées maintenant » en « quelles actions émettre ».
 * Une action part à l'appui ; seules les directions se répètent quand on les maintient.
 * Ce qui est déjà enfoncé au tout premier appel est ignoré (bouton encore tenu au retour d'un jeu).
 */
export class RepeatTracker {
  private readonly nextFire = new Map<Action, number>()
  private primed = false

  update(down: ReadonlySet<Action>, now: number): Action[] {
    const fired: Action[] = []
    for (const action of down) {
      const next = this.nextFire.get(action)
      if (next === undefined) {
        if (this.primed) fired.push(action)
        this.nextFire.set(action, this.primed ? now + FIRST_REPEAT_MS : Infinity)
      } else if (now >= next && DIRECTIONS.has(action)) {
        fired.push(action)
        this.nextFire.set(action, now + REPEAT_MS)
      }
    }
    for (const action of [...this.nextFire.keys()]) {
      if (!down.has(action)) this.nextFire.delete(action)
    }
    this.primed = true
    return fired
  }

  /** Oublie tout : le prochain appel ignorera de nouveau ce qui est déjà enfoncé. */
  reset(): void {
    this.nextFire.clear()
    this.primed = false
  }
}
