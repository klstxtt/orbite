import { DIRECTIONS, type Action, type ActionHandler } from './actions'
import { RepeatTracker } from './repeat'

const STICK_THRESHOLD = 0.6

const KEYS: Readonly<Record<string, Action>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Enter: 'confirm',
  Escape: 'back',
  Backspace: 'back',
  Delete: 'options',
  Tab: 'menu',
  PageUp: 'prevTab',
  PageDown: 'nextTab'
}

/** Boutons de la disposition « standard » de la Gamepad API. */
const PAD = { a: 0, b: 1, y: 3, lb: 4, rb: 5, start: 9, up: 12, down: 13, left: 14, right: 15 } as const

/**
 * Source unique des actions de navigation : clavier + toutes les manettes.
 * Les écrans s'empilent ; seul celui du dessus reçoit les actions.
 */
class InputManager {
  private readonly handlers: ActionHandler[] = []
  private readonly tracker = new RepeatTracker()
  private raf = 0
  private users = 0
  /** Inverse valider et retour (bouton de droite = valider). */
  swapConfirm = false
  /** Courte vibration de la manette à chaque validation. */
  rumble = true
  /** Manette qui a validé en dernier : c'est elle qui vibre. */
  private confirmPad = 0

  /** Démarre l'écoute ; la fonction renvoyée l'arrête. */
  start(): () => void {
    if (this.users++ === 0) {
      window.addEventListener('keydown', this.onKeyDown)
      window.addEventListener('blur', this.onBlur)
      this.raf = requestAnimationFrame(this.poll)
    }
    return () => {
      if (--this.users > 0) return
      window.removeEventListener('keydown', this.onKeyDown)
      window.removeEventListener('blur', this.onBlur)
      cancelAnimationFrame(this.raf)
    }
  }

  /** Place un écran au-dessus de la pile ; la fonction renvoyée le retire. */
  push(handler: ActionHandler): () => void {
    this.handlers.push(handler)
    return () => {
      const i = this.handlers.lastIndexOf(handler)
      if (i >= 0) this.handlers.splice(i, 1)
    }
  }

  private emit(action: Action): void {
    this.handlers[this.handlers.length - 1]?.(action)
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return
    const action = KEYS[e.key]
    if (!action) return
    e.preventDefault()
    // La répétition native du clavier ne sert que pour les directions.
    if (e.repeat && !DIRECTIONS.has(action)) return
    this.emit(action)
  }

  private readonly onBlur = (): void => this.tracker.reset()

  private readonly poll = (now: number): void => {
    this.raf = requestAnimationFrame(this.poll)
    if (!document.hasFocus()) return
    const down = new Set<Action>()
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue
      const pressed = (i: number): boolean => pad.buttons[i]?.pressed ?? false
      const x = pad.axes[0] ?? 0
      const y = pad.axes[1] ?? 0
      if (pressed(PAD.left) || x < -STICK_THRESHOLD) down.add('left')
      if (pressed(PAD.right) || x > STICK_THRESHOLD) down.add('right')
      if (pressed(PAD.up) || y < -STICK_THRESHOLD) down.add('up')
      if (pressed(PAD.down) || y > STICK_THRESHOLD) down.add('down')
      if (pressed(this.swapConfirm ? PAD.b : PAD.a)) {
        down.add('confirm')
        this.confirmPad = pad.index
      }
      if (pressed(this.swapConfirm ? PAD.a : PAD.b)) down.add('back')
      if (pressed(PAD.y)) down.add('options')
      if (pressed(PAD.start)) down.add('menu')
      if (pressed(PAD.lb)) down.add('prevTab')
      if (pressed(PAD.rb)) down.add('nextTab')
    }
    for (const action of this.tracker.update(down, now)) {
      if (action === 'confirm') this.pulse()
      this.emit(action)
    }
  }

  /** Vibration brève ; sans effet sur une manette sans moteur. */
  private pulse(): void {
    if (!this.rumble) return
    const actuator = navigator.getGamepads()[this.confirmPad]?.vibrationActuator
    if (!actuator) return
    actuator.playEffect('dual-rumble', { duration: 70, weakMagnitude: 0.55, strongMagnitude: 0.25 }).catch(() => undefined)
  }
}

export const inputManager = new InputManager()
