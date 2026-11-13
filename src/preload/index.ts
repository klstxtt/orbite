import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { Api } from '../shared/types'

const api: Api = {
  systemStatus: () => ipcRenderer.invoke(IPC.systemStatus),
  toggleFullscreen: () => ipcRenderer.invoke(IPC.toggleFullscreen),
  quit: () => ipcRenderer.invoke(IPC.quit)
}

contextBridge.exposeInMainWorld('api', api)
