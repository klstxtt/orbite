import { execFile, spawn, type ChildProcess } from 'child_process'
import type { GameState } from '../../shared/types'
import type { Command } from '../emulators/profiles'

/** En dessous de cette durée, une sortie avec un code d'erreur est signalée comme un échec de lancement. */
const QUICK_EXIT_MS = 3000

interface Hooks {
  onState(state: GameState): void
  /** Le jeu s'est arrêté après `seconds` secondes (appelé aussi après un échec rapide). */
  onExit(gameId: string, seconds: number): void
}

/**
 * Lance un jeu et suit son processus. Un seul jeu à la fois.
 * Étape 2 : le jeu est considéré terminé quand le processus lancé se ferme. Le suivi des jeux dont le
 * programme n'est qu'un relais, l'écran noir et la détection « prêt » arrivent à l'étape 3.
 */
export class Launcher {
  private child: ChildProcess | null = null
  private runningId: string | null = null

  constructor(private readonly hooks: Hooks) {}

  get isRunning(): boolean {
    return this.runningId !== null
  }

  launch(gameId: string, command: Command): void {
    if (this.runningId) throw new Error('Un jeu est déjà en cours.')
    const started = Date.now()
    let settled = false
    const finish = (state: GameState): void => {
      if (settled) return
      settled = true
      this.child = null
      this.runningId = null
      this.hooks.onExit(gameId, Math.round((Date.now() - started) / 1000))
      this.hooks.onState(state)
    }

    this.runningId = gameId
    // Pas de shell : les arguments partent tels quels, espaces et accents compris.
    const child = spawn(command.exe, command.args, { cwd: command.cwd, stdio: 'ignore', shell: false, windowsHide: false })
    this.child = child
    child.once('spawn', () => this.hooks.onState({ status: 'running', id: gameId }))
    child.once('error', (err) => finish({ status: 'error', id: gameId, message: `Lancement impossible : ${err.message}` }))
    child.once('exit', (code) => {
      const quick = Date.now() - started < QUICK_EXIT_MS
      if (quick && code !== null && code !== 0) {
        finish({ status: 'error', id: gameId, message: `Le jeu s'est fermé aussitôt (code ${code}).` })
      } else {
        finish({ status: 'idle' })
      }
    })
  }

  /** Arrête le jeu en cours et tous les processus qu'il a lancés. */
  stop(): void {
    const pid = this.child?.pid
    if (pid === undefined) return
    execFile('taskkill.exe', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => undefined)
  }
}
