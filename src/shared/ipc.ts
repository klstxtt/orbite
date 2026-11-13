/** Noms des canaux IPC, partagés entre le processus principal et le preload. */
export const IPC = {
  systemStatus: 'system:status',
  toggleFullscreen: 'window:toggleFullscreen',
  quit: 'app:quit'
} as const
