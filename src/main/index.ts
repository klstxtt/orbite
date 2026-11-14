import { app, BrowserWindow, globalShortcut, net, protocol } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { GameState } from '../shared/types'
import { loadProfiles } from './emulators/profiles'
import { broadcast, launchGame, registerIpc, type AppContext } from './ipc/register'
import { Launcher } from './launch/launcher'
import { LoadingOverlay } from './launch/overlay'
import { LibraryService } from './library/service'
import { createLog } from './log'
import { mediaPathFromUrl, themeIdFromUrl } from './media/cache'
import { z } from 'zod'
import { openStores } from './store/stores'
import { ThemeStore } from './themes/store'

// Variables de développement :
//   CL_WINDOWED=1          fenêtre 1280×720 au lieu du plein écran
//   CL_DATA_DIR=<dossier>  dossier de données à part (pour essayer sans toucher à la vraie bibliothèque)
//   CL_CAPTURE=<png>       capture d'écran après CL_CAPTURE_DELAY ms (4000 par défaut), puis sortie
//   CL_CAPTURE_KEYS=<a,b>  touches envoyées avant la capture (noms Electron : Right, Down, Enter, Delete…)
//   CL_WINDOW_SIZE=<LxH>   avec CL_WINDOWED : taille de la fenêtre (1280x720 par défaut)
//   CL_AUTOLAUNCH=<id>     lance ce jeu au démarrage et quitte le lanceur quand il se ferme
//   CL_AUTOSTOP=<ms>       avec CL_AUTOLAUNCH : arrête le jeu ce délai après qu'il est prêt
const WINDOWED = process.env.CL_WINDOWED === '1'
const CAPTURE_TO = process.env.CL_CAPTURE ?? ''
const CAPTURE_DELAY_MS = Number(process.env.CL_CAPTURE_DELAY) || 4000
const CAPTURE_KEYS = (process.env.CL_CAPTURE_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean)
const [WINDOW_W, WINDOW_H] = /^(\d{3,4})x(\d{3,4})$/.exec(process.env.CL_WINDOW_SIZE ?? '')?.slice(1).map(Number) ?? [1280, 720]
const DATA_DIR = process.env.CL_DATA_DIR ?? ''
const AUTOLAUNCH = process.env.CL_AUTOLAUNCH ?? ''
const AUTOSTOP_MS = Number(process.env.CL_AUTOSTOP) || 0

app.setName('Console Launcher')
// Les sons d'interface doivent pouvoir partir d'une action à la manette, qui n'est pas un « geste » pour Chromium.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// Les images du cache sont servies par media://art/<fichier>.
protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

let mainWindow: BrowserWindow | null = null
let gameState: GameState = { status: 'idle' }

function createWindow(fullscreen: boolean): BrowserWindow {
  const win = new BrowserWindow({
    width: WINDOW_W,
    height: WINDOW_H,
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
  // La fenêtre principale fermée, tout s'arrête (l'écran noir de chargement est aussi une fenêtre).
  win.on('closed', () => {
    mainWindow = null
    app.quit()
  })

  // Le rendu ne navigue nulle part et n'ouvre aucune fenêtre.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  if (CAPTURE_TO) {
    win.webContents.once('did-finish-load', () => {
      const KEY_GAP_MS = 350
      CAPTURE_KEYS.forEach((keyCode, i) => {
        setTimeout(() => {
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
        }, CAPTURE_DELAY_MS + i * KEY_GAP_MS)
      })
      setTimeout(
        () => {
          void win.webContents.capturePage().then((image) => {
            writeFileSync(CAPTURE_TO, image.toPNG())
            app.quit()
          })
        },
        CAPTURE_DELAY_MS + CAPTURE_KEYS.length * KEY_GAP_MS + (CAPTURE_KEYS.length > 0 ? 1500 : 0)
      )
    })
  }
  return win
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
  const dataDir = DATA_DIR || app.getPath('userData')
  const stores = openStores(dataDir)
  const log = createLog(join(dataDir, 'launcher.log'))
  const resources = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  const loaded = loadProfiles([join(resources, 'emulators'), stores.userEmulatorsDir])
  const library = new LibraryService(stores, () => loaded.profiles)
  const overlay = new LoadingOverlay()
  const themes = new ThemeStore(join(dataDir, 'themes'))

  const notices = [stores.config.recovery, stores.library.recovery, stores.stats.recovery, ...loaded.errors].filter(
    (n): n is string => n !== null
  )
  for (const notice of notices) log(notice)

  const launcher = new Launcher({
    onState: (state) => {
      gameState = state
      broadcast(ctx)
      if (state.status !== 'running') {
        focusLauncher()
        if (AUTOLAUNCH) setTimeout(() => app.quit(), 500)
      }
    },
    onExit: (gameId, seconds) => {
      const profile = stores.config.get().activeProfile
      const key = `${profile}|${gameId}`
      stores.stats.update((s) => ({
        playtime: { ...s.playtime, [key]: (s.playtime[key] ?? 0) + seconds },
        lastPlayed: { ...s.lastPlayed, [gameId]: Date.now() },
        lastSession: { ...s.lastSession, [gameId]: seconds }
      }))
    },
    onReady: () => {
      if (AUTOSTOP_MS > 0) setTimeout(() => launcher.stop(), AUTOSTOP_MS)
    },
    log,
    showOverlay: (title) => overlay.show(title, mainWindow),
    setOverlayProgress: (text, ratio) => overlay.setProgress(text, ratio),
    hideOverlay: () => overlay.hide(),
    dialogScript: join(resources, 'native', 'answer-dialogs.ps1')
  })

  const ctx: AppContext = {
    stores,
    library,
    themes,
    noInput: z.undefined(),
    profiles: () => loaded.profiles,
    launcher,
    window: () => mainWindow,
    gameState: () => gameState,
    notices
  }

  protocol.handle('media', (request) => {
    const themeId = themeIdFromUrl(request.url)
    const file = themeId ? themes.wallpaperPath(themeId) : mediaPathFromUrl(stores.mediaDir, request.url)
    return file ? net.fetch(pathToFileURL(file).toString()) : new Response(null, { status: 404 })
  })

  registerIpc(ctx)
  const win = createWindow(!WINDOWED && stores.config.get().fullscreen)

  // Retour au lanceur depuis un jeu : arrête le jeu en cours.
  globalShortcut.register('Control+Alt+Q', () => {
    if (launcher.isRunning) launcher.stop()
    else focusLauncher()
  })

  if (AUTOLAUNCH) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        launchGame(ctx, AUTOLAUNCH).catch((err: unknown) => {
          log(`lancement automatique impossible : ${err instanceof Error ? err.message : String(err)}`)
          app.quit()
        })
      }, 2500)
    })
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', focusLauncher)
  void app.whenReady().then(start)
  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('window-all-closed', () => app.quit())
}
