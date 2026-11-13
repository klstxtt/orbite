import { app, BrowserWindow, ipcMain } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { IPC } from '../shared/ipc'
import { readSystemStatus } from './system/status'

// Variables de développement : fenêtre 1280×720 au lieu du plein écran, et capture d'écran puis sortie.
const WINDOWED = process.env.CL_WINDOWED === '1'
const CAPTURE_TO = process.env.CL_CAPTURE ?? ''

// Les sons d'interface doivent pouvoir partir d'une action à la manette, qui n'est pas un « geste » pour Chromium.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    fullscreen: !WINDOWED,
    frame: WINDOWED,
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
      }, 4000)
    })
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.systemStatus, () => readSystemStatus())
  ipcMain.handle(IPC.toggleFullscreen, () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen())
  })
  ipcMain.handle(IPC.quit, () => app.quit())
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  void app.whenReady().then(() => {
    registerIpc()
    createWindow()
  })
  app.on('window-all-closed', () => app.quit())
}
