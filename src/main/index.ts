import { app, BrowserWindow, globalShortcut, net, protocol } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { GameState } from '../shared/types'
import { loadProfiles } from './emulators/profiles'
import { broadcast, registerIpc, type AppContext } from './ipc/register'
import { Launcher } from './launch/launcher'
import { LibraryService } from './library/service'
import { mediaPathFromUrl } from './media/cache'
import { openStores } from './store/stores'

// Variables de développement : fenêtre 1280×720 au lieu du plein écran, capture d'écran puis sortie,
// et dossier de données à part (pour essayer sans toucher à la vraie bibliothèque).
const WINDOWED = process.env.CL_WINDOWED === '1'
const CAPTURE_TO = process.env.CL_CAPTURE ?? ''
const DATA_DIR = process.env.CL_DATA_DIR ?? ''
const CAPTURE_DELAY_MS = Number(process.env.CL_CAPTURE_DELAY) || 4000

app.setName('Console Launcher')
// Les sons d'interface doivent pouvoir partir d'une action à la manette, qui n'est pas un « geste » pour Chromium.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// Les images du cache sont servies par media://art/<fichier>.
protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

let mainWindow: BrowserWindow | null = null
let gameState: GameState = { status: 'idle' }

function createWindow(fullscreen: boolean): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    fullscreen,
    frame: !fullscreen,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    show: false,
    title: 'Console Launcher',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow = win
  win.setMenuBarVisibility(false)
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    mainWindow = null
  })

  // Le rendu ne navigue nulle part et n'ouvre aucune fenêtre.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  if (CAPTURE_TO) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void win.webContents.capturePage().then((image) => {
          writeFileSync(CAPTURE_TO, image.toPNG())
          app.quit()
        })
      }, CAPTURE_DELAY_MS)
    })
  }
}

/** Ramène le lanceur au premier plan (fin d'un jeu, seconde instance). */
function focusLauncher(): void {
  const win = mainWindow
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.moveTop()
  win.focus()
}

function start(): void {
  const stores = openStores(DATA_DIR || app.getPath('userData'))
  const builtinProfiles = app.isPackaged
    ? join(process.resourcesPath, 'emulators')
    : join(app.getAppPath(), 'resources', 'emulators')
  const loaded = loadProfiles([builtinProfiles, stores.userEmulatorsDir])
  const library = new LibraryService(stores, () => loaded.profiles)

  const notices = [stores.config.recovery, stores.library.recovery, stores.stats.recovery, ...loaded.errors].filter(
    (n): n is string => n !== null
  )

  const launcher = new Launcher({
    onState: (state) => {
      gameState = state
      broadcast(ctx)
      if (state.status !== 'running') focusLauncher()
    },
    onExit: (gameId, seconds) => {
      const profile = stores.config.get().activeProfile
      const key = `${profile}|${gameId}`
      stores.stats.update((s) => ({
        playtime: { ...s.playtime, [key]: (s.playtime[key] ?? 0) + seconds },
        lastPlayed: { ...s.lastPlayed, [gameId]: Date.now() }
      }))
    }
  })

  const ctx: AppContext = {
    stores,
    library,
    profiles: () => loaded.profiles,
    launcher,
    window: () => mainWindow,
    gameState: () => gameState,
    notices
  }

  protocol.handle('media', (request) => {
    const file = mediaPathFromUrl(stores.mediaDir, request.url)
    return file ? net.fetch(pathToFileURL(file).toString()) : new Response(null, { status: 404 })
  })

  registerIpc(ctx)
  createWindow(!WINDOWED && stores.config.get().fullscreen)

  // Retour au lanceur depuis un jeu : arrête le jeu en cours.
  globalShortcut.register('Control+Alt+Q', () => {
    if (launcher.isRunning) launcher.stop()
    else focusLauncher()
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', focusLauncher)
  void app.whenReady().then(start)
  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('window-all-closed', () => app.quit())
}
