import { execFile, spawn, type ChildProcess } from 'child_process'
import { substituteArgs } from '../../shared/args'
import type { EmulatorProfile } from '../../shared/schemas'
import type { GameState } from '../../shared/types'
import type { Command } from '../emulators/profiles'
import {
  createIconFromPng,
  destroyIcon,
  focusWindow,
  listProcesses,
  listWindows,
  nativeAvailable,
  PAD,
  readPadButtons,
  requestClose,
  setWindowIcon,
  setWindowTitle,
  type WindowInfo
} from '../native/win32'
import { startDialogWatcher } from './dialogs'
import { LogTail } from './logTail'
import { ReadyDetector, type ReadyRules } from './ready'
import { trackProcessTree } from './tree'

const TICK_MS = 250
const PROCESS_SCAN_MS = 1000
const DRESS_MS = 1000
/** En dessous de cette durée, une sortie avec un code d'erreur est signalée comme un échec de lancement. */
const QUICK_EXIT_MS = 3000
/** Back + Start maintenus : quitter le jeu. */
const QUIT_HOLD_MS = 2000
/** B maintenu pendant le chargement : retirer l'écran noir tout de suite. */
const REVEAL_HOLD_MS = 1000
/** Délai laissé au jeu pour se fermer proprement avant de le tuer. */
const GRACEFUL_STOP_MS = 4000
/** Une fenêtre plus petite n'est pas la fenêtre du jeu (infobulle, écran de démarrage…). */
const MIN_WINDOW = { width: 200, height: 150 }
const ICON_PX = 256
/** Sans profil d'émulateur : le jeu est prêt peu après l'apparition de sa fenêtre. */
const PC_SETTLE_MS = 800

export interface LaunchRequest {
  gameId: string
  title: string
  command: Command
  /** Profil de l'émulateur, ou null pour un jeu PC. */
  profile: EmulatorProfile | null
  /** Jaquette en PNG carré de 256 px pour l'icône de la fenêtre, ou null. */
  iconPng: Buffer | null
}

export interface LauncherHooks {
  onState(state: GameState): void
  /** Le jeu s'est arrêté après `seconds` secondes. */
  onExit(gameId: string, seconds: number): void
  log(line: string): void
  /** L'écran noir vient d'être retiré : le jeu est affiché. */
  onReady(): void
  /** Écran noir de chargement. */
  showOverlay(title: string): void
  setOverlayProgress(text: string, ratio: number | null): void
  hideOverlay(): void
  /** Chemin du script qui répond aux boîtes de dialogue. */
  dialogScript: string
}

function readyRules(profile: EmulatorProfile | null): ReadyRules {
  if (!profile) return { settleMs: PC_SETTLE_MS }
  const { ready } = profile
  return {
    log: ready.log ? new RegExp(ready.log.pattern) : undefined,
    title: ready.title ? new RegExp(ready.title) : undefined,
    progress: ready.progress ? new RegExp(ready.progress) : undefined,
    settleMs: ready.settleMs
  }
}

/** La plus grande fenêtre du jeu qui n'est pas une boîte de dialogue. */
export function pickMainWindow(windows: readonly WindowInfo[]): WindowInfo | null {
  let best: WindowInfo | null = null
  for (const w of windows) {
    if (w.owned || w.width < MIN_WINDOW.width || w.height < MIN_WINDOW.height) continue
    if (!best || w.width * w.height > best.width * best.height) best = w
  }
  return best
}

/** Suivi d'un jeu lancé, du démarrage à la fermeture de tout son arbre de processus. */
class Session {
  private readonly started = Date.now()
  private readonly known = new Set<number>()
  private alive = new Set<number>()
  private readonly child: ChildProcess
  private rootExited = false
  private rootCode: number | null = null
  private sawOtherProcess = false
  private timer: NodeJS.Timeout | null = null
  private lastScan = 0
  private lastDress = 0
  private ready = false
  private ended = false
  private stopRequested = false
  private readonly detector: ReadyDetector
  private readonly tail: LogTail | null
  private readonly icon: number
  private dressedWindow = 0
  private quitHeldSince: number | null = null
  private revealHeldSince: number | null = null
  private dialogs: ChildProcess | null = null
  private lastProgress = ''

  constructor(
    private readonly request: LaunchRequest,
    private readonly hooks: LauncherHooks,
    private readonly onEnd: () => void
  ) {
    const { command, profile } = request
    this.detector = new ReadyDetector(readyRules(profile), this.started)
    const logFile = profile?.ready.log
      ? substituteArgs([profile.ready.log.file], { emuDir: command.cwd, game: '' })[0]
      : undefined
    // Ouvert avant le lancement : tout ce que le journal contient déjà sera ignoré.
    this.tail = logFile ? new LogTail(logFile) : null
    this.icon = request.iconPng ? createIconFromPng(request.iconPng, ICON_PX) : 0

    hooks.log(`lancement « ${request.title} » : ${command.exe} ${JSON.stringify(command.args)}`)
    // Pas de shell : les arguments partent tels quels, espaces et accents compris.
    this.child = spawn(command.exe, command.args, { cwd: command.cwd, stdio: 'ignore', shell: false })
    this.child.once('spawn', () => this.onSpawn())
    this.child.once('error', (err) => this.finish(`Lancement impossible : ${err.message}`))
    this.child.once('exit', (code) => {
      this.rootExited = true
      this.rootCode = code
      this.lastScan = 0
    })
  }

  private onSpawn(): void {
    const pid = this.child.pid
    if (pid !== undefined) this.known.add(pid)
    this.hooks.onState({ status: 'running', id: this.request.gameId })
    this.hooks.showOverlay(this.request.title)
    const rules = this.request.profile?.dialogs ?? []
    if (pid !== undefined) {
      this.dialogs = startDialogWatcher(this.hooks.dialogScript, pid, rules, this.hooks.log)
    }
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  private tick(): void {
    if (this.ended) return
    const now = Date.now()

    if (now - this.lastScan >= PROCESS_SCAN_MS) {
      this.lastScan = now
      const processes = listProcesses()
      if (processes.length > 0) {
        this.alive = trackProcessTree(this.known, processes)
        if (this.known.size > 1) this.sawOtherProcess = true
      } else {
        // Appels natifs indisponibles : on ne suit que le processus lancé.
        this.alive = this.rootExited ? new Set() : new Set(this.known)
      }
      if (this.rootExited && this.alive.size === 0) {
        const quick = now - this.started < QUICK_EXIT_MS && !this.sawOtherProcess
        const failed = quick && this.rootCode !== null && this.rootCode !== 0 && !this.stopRequested
        this.finish(failed ? `Le jeu s'est fermé aussitôt (code ${this.rootCode}).` : null)
        return
      }
    }

    const main = pickMainWindow(listWindows(this.alive))

    if (!this.ready) {
      const isReady = this.detector.feed({
        log: this.tail?.read() ?? '',
        logAvailable: this.tail?.fresh ?? false,
        title: main?.title ?? null,
        now
      })
      const progress = this.detector.progress
      if (progress) {
        const text = `Préparation : ${progress.done.toLocaleString('fr-FR')} / ${progress.total.toLocaleString('fr-FR')}`
        if (text !== this.lastProgress) {
          this.lastProgress = text
          this.hooks.setOverlayProgress(text, progress.done / progress.total)
        }
      }
      if (isReady) this.reveal(this.detector.reason ?? 'prêt', main)
    }

    // Le titre et l'icône ne sont remplacés qu'une fois le jeu prêt : avant, le titre sert à la détection.
    if (this.ready && main && now - this.lastDress >= DRESS_MS) {
      this.lastDress = now
      if (main.title !== this.request.title) {
        if (main.hwnd !== this.dressedWindow) this.hooks.log(`titre de la fenêtre remplacé (était « ${main.title} »)`)
        else this.hooks.log(`le jeu a réécrit son titre (« ${main.title} ») : remplacé de nouveau`)
        setWindowTitle(main.hwnd, this.request.title)
      }
      if (this.icon !== 0 && main.hwnd !== this.dressedWindow) {
        setWindowIcon(main.hwnd, this.icon)
        this.dressedWindow = main.hwnd
        this.hooks.log(`icône de la fenêtre remplacée (${main.width}×${main.height})`)
      } else if (this.icon === 0) {
        this.dressedWindow = main.hwnd
      }
    }

    this.readPad(now, main)
  }

  private readPad(now: number, main: WindowInfo | null): void {
    const buttons = readPadButtons()
    const quit = (buttons & (PAD.back | PAD.start)) === (PAD.back | PAD.start)
    this.quitHeldSince = quit ? (this.quitHeldSince ?? now) : null
    if (this.quitHeldSince !== null && now - this.quitHeldSince >= QUIT_HOLD_MS) {
      this.quitHeldSince = null
      this.hooks.log('Back + Start maintenus : arrêt du jeu')
      this.stop()
      return
    }
    const reveal = !this.ready && (buttons & PAD.b) !== 0
    this.revealHeldSince = reveal ? (this.revealHeldSince ?? now) : null
    if (this.revealHeldSince !== null && now - this.revealHeldSince >= REVEAL_HOLD_MS) {
      this.revealHeldSince = null
      this.reveal('B maintenu', main)
    }
  }

  /** Retire l'écran noir et donne le premier plan au jeu. */
  private reveal(reason: string, main: WindowInfo | null): void {
    if (this.ready) return
    this.ready = true
    this.hooks.log(`jeu prêt (${reason}) après ${Math.round((Date.now() - this.started) / 1000)} s`)
    this.hooks.hideOverlay()
    this.dialogs?.kill()
    this.dialogs = null
    if (main) focusWindow(main.hwnd)
    this.hooks.onReady()
  }

  revealNow(): void {
    this.reveal('demande du lanceur', pickMainWindow(listWindows(this.alive)))
  }

  /** Demande la fermeture des fenêtres du jeu, puis tue ses processus s'il ne s'est pas fermé. */
  stop(): void {
    if (this.ended || this.stopRequested) return
    this.stopRequested = true
    this.hooks.log('arrêt du jeu demandé')
    for (const w of listWindows(this.alive)) if (!w.owned) requestClose(w.hwnd)
    setTimeout(() => {
      if (this.ended) return
      const pids = new Set([...this.alive, ...(this.child.pid !== undefined ? [this.child.pid] : [])])
      for (const pid of pids) {
        execFile('taskkill.exe', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => undefined)
      }
    }, nativeAvailable() ? GRACEFUL_STOP_MS : 0)
  }

  private finish(error: string | null): void {
    if (this.ended) return
    this.ended = true
    if (this.timer) clearInterval(this.timer)
    this.dialogs?.kill()
    destroyIcon(this.icon)
    this.hooks.hideOverlay()
    const seconds = Math.round((Date.now() - this.started) / 1000)
    this.hooks.log(error ? `fin du jeu avec erreur : ${error}` : `fin du jeu après ${seconds} s`)
    this.onEnd()
    this.hooks.onExit(this.request.gameId, seconds)
    this.hooks.onState(error ? { status: 'error', id: this.request.gameId, message: error } : { status: 'idle' })
  }
}

/**
 * Lance un jeu (un seul à la fois) : écran noir pendant le chargement, réponse aux dialogues connus,
 * retrait de l'écran noir quand le jeu est prêt, titre et jaquette sur sa fenêtre, puis retour au
 * lanceur quand tous ses processus sont fermés.
 */
export class Launcher {
  private session: Session | null = null

  constructor(private readonly hooks: LauncherHooks) {}

  get isRunning(): boolean {
    return this.session !== null
  }

  launch(request: LaunchRequest): void {
    if (this.session) throw new Error('Un jeu est déjà en cours.')
    this.session = new Session(request, this.hooks, () => {
      this.session = null
    })
  }

  /** Retire l'écran noir sans attendre la détection. */
  reveal(): void {
    this.session?.revealNow()
  }

  stop(): void {
    this.session?.stop()
  }
}
