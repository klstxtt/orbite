import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc'
import type { Api, AppState } from '../shared/types'

const call =
  <T>(channel: string) =>
  (input?: unknown): Promise<T> =>
    ipcRenderer.invoke(channel, input) as Promise<T>

const api: Api = {
  systemStatus: call(IPC.systemStatus),
  toggleFullscreen: call(IPC.toggleFullscreen),
  quit: call(IPC.quit),

  getState: call(IPC.getState),
  onState: (cb) => {
    const listener = (_event: IpcRendererEvent, state: AppState): void => cb(state)
    ipcRenderer.on(IPC.stateChanged, listener)
    return () => ipcRenderer.removeListener(IPC.stateChanged, listener)
  },
  setOnboarded: call(IPC.setOnboarded),

  addPcGame: call(IPC.addPcGame),
  addEmulatedGame: call(IPC.addEmulatedGame),
  locateEmulator: call(IPC.locateEmulator),
  scanFolder: call(IPC.scanFolder),
  importGames: call(IPC.importGames),
  setGameArt: call(IPC.setGameArt),
  removeGame: call(IPC.removeGame),

  renameGame: call(IPC.renameGame),
  setGameArgs: call(IPC.setGameArgs),

  updateSettings: call(IPC.updateSettings),
  profileAction: call(IPC.profileAction),
  themeAction: call(IPC.themeAction),
  sleep: call(IPC.sleep),

  launchGame: call(IPC.launchGame),
  stopGame: call(IPC.stopGame)
}

contextBridge.exposeInMainWorld('api', api)
