import koffi from 'koffi'

/**
 * Appels Win32 du lanceur (processus, fenêtres, icônes, manette) via koffi.
 * Tout est chargé au premier usage ; si une bibliothèque manque, les fonctions renvoient des valeurs
 * neutres au lieu de lever une erreur : le jeu se lance quand même, sans les finitions.
 * Les messages envoyés aux fenêtres d'un autre programme ont toujours un délai : une fenêtre bloquée
 * ne bloque jamais le lanceur.
 */

export interface ProcessInfo {
  pid: number
  /** Processus parent. */
  ppid: number
}

export interface WindowInfo {
  hwnd: number
  pid: number
  title: string
  /** Fenêtre possédée par une autre (boîte de dialogue, palette…). */
  owned: boolean
  width: number
  height: number
}

/** Boutons XInput utiles au lanceur. */
export const PAD = { start: 0x0010, back: 0x0020, b: 0x2000 } as const

const TH32CS_SNAPPROCESS = 0x2
const GW_OWNER = 4
const GWL_EXSTYLE = -20
const WS_EX_TOOLWINDOW = 0x80
const WM_CLOSE = 0x0010
const WM_SETTEXT = 0x000c
const WM_SETICON = 0x0080
const SMTO_ABORTIFHUNG = 0x2
const MESSAGE_TIMEOUT_MS = 200
const ICON_VERSION = 0x00030000

type Fn = (...args: never[]) => unknown
interface Bindings {
  snapshot: (flags: number, pid: number) => number
  processFirst: (snap: number, entry: object) => boolean
  processNext: (snap: number, entry: object) => boolean
  closeHandle: (handle: number) => boolean
  entrySize: number
  enumWindows: (cb: (hwnd: number, lParam: number) => boolean, lParam: number) => boolean
  windowPid: (hwnd: number, out: number[]) => number
  isVisible: (hwnd: number) => boolean
  getWindow: (hwnd: number, cmd: number) => number
  getLong: (hwnd: number, index: number) => number
  getRect: (hwnd: number, out: { left?: number; top?: number; right?: number; bottom?: number }) => boolean
  getText: (hwnd: number, buffer: Uint16Array, max: number) => number
  sendText: (hwnd: number, msg: number, w: number, text: string, flags: number, timeout: number, out: number[]) => number
  sendValue: (hwnd: number, msg: number, w: number, l: number, flags: number, timeout: number, out: number[]) => number
  postMessage: (hwnd: number, msg: number, w: number, l: number) => boolean
  setForeground: (hwnd: number) => boolean
  createIcon: (bits: Buffer, size: number, icon: boolean, version: number, cx: number, cy: number, flags: number) => number
  destroyIcon: (icon: number) => boolean
  padState: ((index: number, out: { Gamepad?: { wButtons?: number } }) => number) | null
}

let cached: Bindings | null | undefined

function bindings(): Bindings | null {
  if (cached !== undefined) return cached
  try {
    const kernel32 = koffi.load('kernel32.dll')
    const user32 = koffi.load('user32.dll')
    const entry = koffi.struct('PROCESSENTRY32W', {
      dwSize: 'uint32_t',
      cntUsage: 'uint32_t',
      th32ProcessID: 'uint32_t',
      th32DefaultHeapID: 'uintptr_t',
      th32ModuleID: 'uint32_t',
      cntThreads: 'uint32_t',
      th32ParentProcessID: 'uint32_t',
      pcPriClassBase: 'int32_t',
      dwFlags: 'uint32_t',
      szExeFile: koffi.array('char16_t', 260)
    })
    koffi.struct('CL_RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' })
    koffi.proto('bool __stdcall CL_EnumWindowsProc(intptr_t hwnd, intptr_t lParam)')
    const fn = <T extends Fn>(lib: ReturnType<typeof koffi.load>, signature: string): T => lib.func(signature) as unknown as T

    // La manette est facultative : sans xinput1_4.dll, tout le reste fonctionne.
    let padState: Bindings['padState'] = null
    try {
      const xinput = koffi.load('xinput1_4.dll')
      const gamepad = koffi.struct('CL_XINPUT_GAMEPAD', {
        wButtons: 'uint16_t',
        bLeftTrigger: 'uint8_t',
        bRightTrigger: 'uint8_t',
        sThumbLX: 'int16_t',
        sThumbLY: 'int16_t',
        sThumbRX: 'int16_t',
        sThumbRY: 'int16_t'
      })
      koffi.struct('CL_XINPUT_STATE', { dwPacketNumber: 'uint32_t', Gamepad: gamepad })
      padState = fn(xinput, 'uint32_t XInputGetState(uint32_t index, _Out_ CL_XINPUT_STATE *state)')
    } catch {
      padState = null
    }

    cached = {
      snapshot: fn(kernel32, 'intptr_t CreateToolhelp32Snapshot(uint32_t flags, uint32_t pid)'),
      processFirst: fn(kernel32, 'bool Process32FirstW(intptr_t snap, _Inout_ PROCESSENTRY32W *entry)'),
      processNext: fn(kernel32, 'bool Process32NextW(intptr_t snap, _Inout_ PROCESSENTRY32W *entry)'),
      closeHandle: fn(kernel32, 'bool CloseHandle(intptr_t handle)'),
      entrySize: koffi.sizeof(entry),
      enumWindows: fn(user32, 'bool EnumWindows(CL_EnumWindowsProc *cb, intptr_t lParam)'),
      windowPid: fn(user32, 'uint32_t GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)'),
      isVisible: fn(user32, 'bool IsWindowVisible(intptr_t hwnd)'),
      getWindow: fn(user32, 'intptr_t GetWindow(intptr_t hwnd, uint32_t cmd)'),
      getLong: fn(user32, 'int32_t GetWindowLongW(intptr_t hwnd, int index)'),
      getRect: fn(user32, 'bool GetWindowRect(intptr_t hwnd, _Out_ CL_RECT *rect)'),
      getText: fn(user32, 'int InternalGetWindowText(intptr_t hwnd, _Out_ uint16_t *buffer, int max)'),
      sendText: fn(
        user32,
        'intptr_t SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t w, str16 l, uint32_t flags, uint32_t timeout, _Out_ uintptr_t *result)'
      ),
      sendValue: fn(
        user32,
        'intptr_t SendMessageTimeoutW(intptr_t hwnd, uint32_t msg, uintptr_t w, intptr_t l, uint32_t flags, uint32_t timeout, _Out_ uintptr_t *result)'
      ),
      postMessage: fn(user32, 'bool PostMessageW(intptr_t hwnd, uint32_t msg, uintptr_t w, intptr_t l)'),
      setForeground: fn(user32, 'bool SetForegroundWindow(intptr_t hwnd)'),
      createIcon: fn(
        user32,
        'intptr_t CreateIconFromResourceEx(const uint8_t *bits, uint32_t size, bool icon, uint32_t version, int cx, int cy, uint32_t flags)'
      ),
      destroyIcon: fn(user32, 'bool DestroyIcon(intptr_t icon)'),
      padState
    }
  } catch {
    cached = null
  }
  return cached
}

/** Vrai si les appels natifs sont disponibles. */
export const nativeAvailable = (): boolean => bindings() !== null

/** Tous les processus en cours, avec leur parent. */
export function listProcesses(): ProcessInfo[] {
  const b = bindings()
  if (!b) return []
  const snap = b.snapshot(TH32CS_SNAPPROCESS, 0)
  if (snap === -1 || snap === 0) return []
  const out: ProcessInfo[] = []
  try {
    const entry: { dwSize: number; th32ProcessID?: number; th32ParentProcessID?: number } = { dwSize: b.entrySize }
    let more = b.processFirst(snap, entry)
    while (more) {
      out.push({ pid: entry.th32ProcessID ?? 0, ppid: entry.th32ParentProcessID ?? 0 })
      more = b.processNext(snap, entry)
    }
  } finally {
    b.closeHandle(snap)
  }
  return out
}

/** Fenêtres visibles de premier niveau appartenant aux processus donnés (hors fenêtres-outils). */
export function listWindows(pids: ReadonlySet<number>): WindowInfo[] {
  const b = bindings()
  if (!b || pids.size === 0) return []
  const found: WindowInfo[] = []
  const text = new Uint16Array(512)
  b.enumWindows((hwnd) => {
    const pidOut = [0]
    b.windowPid(hwnd, pidOut)
    const pid = pidOut[0] ?? 0
    if (!pids.has(pid) || !b.isVisible(hwnd)) return true
    if ((b.getLong(hwnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) !== 0) return true
    const rect: { left?: number; top?: number; right?: number; bottom?: number } = {}
    b.getRect(hwnd, rect)
    const length = b.getText(hwnd, text, text.length)
    found.push({
      hwnd,
      pid,
      title: String.fromCharCode(...text.subarray(0, Math.max(0, length))),
      owned: b.getWindow(hwnd, GW_OWNER) !== 0,
      width: (rect.right ?? 0) - (rect.left ?? 0),
      height: (rect.bottom ?? 0) - (rect.top ?? 0)
    })
    return true
  }, 0)
  return found
}

/** Change le titre d'une fenêtre (barre des tâches, Alt+Tab). */
export function setWindowTitle(hwnd: number, title: string): void {
  bindings()?.sendText(hwnd, WM_SETTEXT, 0, title, SMTO_ABORTIFHUNG, MESSAGE_TIMEOUT_MS, [0])
}

/** Donne une icône (grande et petite) à une fenêtre. */
export function setWindowIcon(hwnd: number, icon: number): void {
  const b = bindings()
  if (!b || icon === 0) return
  b.sendValue(hwnd, WM_SETICON, 1, icon, SMTO_ABORTIFHUNG, MESSAGE_TIMEOUT_MS, [0])
  b.sendValue(hwnd, WM_SETICON, 0, icon, SMTO_ABORTIFHUNG, MESSAGE_TIMEOUT_MS, [0])
}

/**
 * Crée une icône à partir d'une image PNG carrée de `size` pixels. Renvoie 0 en cas d'échec.
 * L'icône appartient au lanceur : elle doit vivre aussi longtemps que la fenêtre qui l'affiche.
 */
export function createIconFromPng(png: Buffer, size: number): number {
  return bindings()?.createIcon(png, png.length, true, ICON_VERSION, size, size, 0) ?? 0
}

export function destroyIcon(icon: number): void {
  if (icon !== 0) bindings()?.destroyIcon(icon)
}

export function focusWindow(hwnd: number): void {
  bindings()?.setForeground(hwnd)
}

/** Demande poliment la fermeture d'une fenêtre (comme un clic sur la croix). */
export function requestClose(hwnd: number): void {
  bindings()?.postMessage(hwnd, WM_CLOSE, 0, 0)
}

/** Boutons enfoncés, toutes manettes XInput confondues (0 si aucune manette). */
export function readPadButtons(): number {
  const pad = bindings()?.padState
  if (!pad) return 0
  let buttons = 0
  for (let i = 0; i < 4; i++) {
    const state: { Gamepad?: { wButtons?: number } } = {}
    if (pad(i, state) === 0) buttons |= state.Gamepad?.wButtons ?? 0
  }
  return buttons
}
