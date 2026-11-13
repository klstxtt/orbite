import { describe, expect, it } from 'vitest'
import type { Action } from '../src/renderer/src/input/actions'
import { FIRST_REPEAT_MS, REPEAT_MS, RepeatTracker } from '../src/renderer/src/input/repeat'

const set = (...actions: Action[]): Set<Action> => new Set(actions)

describe('RepeatTracker', () => {
  it('ignore ce qui est déjà enfoncé au premier appel', () => {
    const t = new RepeatTracker()
    expect(t.update(set('confirm', 'right'), 0)).toEqual([])
    expect(t.update(set('confirm', 'right'), 5000)).toEqual([])
    // Relâché puis réappuyé : l'action part.
    expect(t.update(set(), 5010)).toEqual([])
    expect(t.update(set('confirm'), 5020)).toEqual(['confirm'])
  })

  it('émet une direction à l’appui puis la répète quand on la maintient', () => {
    const t = new RepeatTracker()
    t.update(set(), 0)
    expect(t.update(set('right'), 10)).toEqual(['right'])
    expect(t.update(set('right'), 10 + FIRST_REPEAT_MS - 1)).toEqual([])
    expect(t.update(set('right'), 10 + FIRST_REPEAT_MS)).toEqual(['right'])
    expect(t.update(set('right'), 10 + FIRST_REPEAT_MS + REPEAT_MS - 1)).toEqual([])
    expect(t.update(set('right'), 10 + FIRST_REPEAT_MS + REPEAT_MS)).toEqual(['right'])
  })

  it('ne répète pas valider, retour ni options', () => {
    const t = new RepeatTracker()
    t.update(set(), 0)
    expect(t.update(set('confirm', 'back', 'options'), 10)).toEqual(['confirm', 'back', 'options'])
    expect(t.update(set('confirm', 'back', 'options'), 10_000)).toEqual([])
  })

  it('repart de zéro après reset (perte du focus)', () => {
    const t = new RepeatTracker()
    t.update(set(), 0)
    t.reset()
    expect(t.update(set('left'), 10)).toEqual([])
  })
})
