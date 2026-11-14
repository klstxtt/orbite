/** Noms des canaux IPC, partagés entre le processus principal et le preload. */
export const IPC = {
  systemStatus: 'system:status',
  toggleFullscreen: 'window:toggleFullscreen',
  quit: 'app:quit',
  getState: 'state:get',
  stateChanged: 'state:changed',
  setOnboarded: 'config:setOnboarded',
  addPcGame: 'library:addPc',
  addEmulatedGame: 'library:addEmulated',
  locateEmulator: 'emulators:locate',
  scanFolder: 'library:scanFolder',
  importGames: 'library:import',
  setGameArt: 'library:setArt',
  removeGame: 'library:remove',
  renameGame: 'library:rename',
  setGameArgs: 'library:setArgs',
  updateSettings: 'settings:update',
  profileAction: 'profiles:action',
  themeAction: 'themes:action',
  sleep: 'system:sleep',
  launchGame: 'game:launch',
  stopGame: 'game:stop'
} as const
