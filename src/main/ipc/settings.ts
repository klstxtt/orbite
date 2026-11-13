import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import {
  ProfileActionSchema,
  RenameGameSchema,
  SettingsPatchSchema,
  ThemeActionSchema,
  type ProfileAction,
  type ThemeAction
} from '../../shared/schemas'
import { IPC } from '../../shared/ipc'
import { PROFILE_COLORS } from '../../shared/themes'
import { cancelled, ok, type Result } from '../../shared/types'
import { removeArt, storeAvatar } from '../media/cache'
import { broadcast, pick, type AppContext, type Handle } from './register'

const MAX_PROFILES = 8
const IMAGE_FILTER = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'tif', 'tiff'] }]

/** Canaux des profils, des thèmes et des réglages. */
export function registerSettingsIpc(ctx: AppContext, handle: Handle): void {
  const { config } = ctx.stores

  const profileOf = (id: string) => {
    const profile = config.get().profiles.find((p) => p.id === id)
    if (!profile) throw new Error('Profil introuvable.')
    return profile
  }
  const patchProfile = (id: string, patch: { name?: string; color?: string; avatar?: string }): void => {
    profileOf(id)
    config.update((c) => ({ ...c, profiles: c.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  }

  const runProfile = async (action: ProfileAction): Promise<Result<string>> => {
    switch (action.type) {
      case 'create': {
        const { profiles } = config.get()
        if (profiles.length >= MAX_PROFILES) throw new Error(`Pas plus de ${MAX_PROFILES} profils.`)
        const id = randomUUID().slice(0, 8)
        const color = PROFILE_COLORS[profiles.length % PROFILE_COLORS.length] ?? '#2f6fe0'
        config.update((c) => ({ ...c, profiles: [...c.profiles, { id, name: action.name, color, avatar: '' }] }))
        return ok(id)
      }
      case 'rename':
        patchProfile(action.id, { name: action.name })
        return ok(action.id)
      case 'color':
        patchProfile(action.id, { color: action.color })
        return ok(action.id)
      case 'pickAvatar': {
        const previous = profileOf(action.id).avatar
        const source = await pick(ctx, { title: 'Choisir l’image du profil', properties: ['openFile'], filters: IMAGE_FILTER })
        if (!source) return cancelled()
        let file: string
        try {
          file = await storeAvatar(ctx.stores.mediaDir, action.id, source)
        } catch {
          throw new Error("Cette image n'a pas pu être lue.")
        }
        patchProfile(action.id, { avatar: file })
        removeArt(ctx.stores.mediaDir, previous)
        return ok(action.id)
      }
      case 'clearAvatar':
        removeArt(ctx.stores.mediaDir, profileOf(action.id).avatar)
        patchProfile(action.id, { avatar: '' })
        return ok(action.id)
      case 'delete': {
        const profile = profileOf(action.id)
        if (config.get().profiles.length <= 1) throw new Error('Il faut garder au moins un profil.')
        config.update((c) => {
          const profiles = c.profiles.filter((p) => p.id !== action.id)
          const first = profiles[0]?.id ?? c.activeProfile
          return { ...c, profiles, activeProfile: c.activeProfile === action.id ? first : c.activeProfile }
        })
        removeArt(ctx.stores.mediaDir, profile.avatar)
        // Le temps de jeu de ce profil part avec lui.
        ctx.stores.stats.update((s) => ({
          ...s,
          playtime: Object.fromEntries(Object.entries(s.playtime).filter(([key]) => !key.startsWith(`${action.id}|`)))
        }))
        return ok(action.id)
      }
      case 'activate':
        profileOf(action.id)
        config.update((c) => ({ ...c, activeProfile: action.id }))
        return ok(action.id)
    }
  }

  const runTheme = async (action: ThemeAction): Promise<Result<string>> => {
    const { themes } = ctx
    const activate = (id: string): void => {
      config.update((c) => ({ ...c, activeTheme: id }))
    }
    switch (action.type) {
      case 'activate':
        if (!themes.exists(action.id)) throw new Error('Thème introuvable.')
        activate(action.id)
        return ok(action.id)
      case 'create': {
        const created = await themes.create(action.name, action.fromId)
        activate(created.id)
        return ok(created.id)
      }
      case 'update':
        return ok(themes.update(action.id, action.patch).id)
      case 'pickWallpaper': {
        const source = await pick(ctx, { title: 'Choisir le fond d’écran du thème', properties: ['openFile'], filters: IMAGE_FILTER })
        if (!source) return cancelled()
        return ok((await themes.setWallpaper(action.id, source)).id)
      }
      case 'clearWallpaper':
        return ok(themes.clearWallpaper(action.id).id)
      case 'delete':
        themes.remove(action.id)
        if (config.get().activeTheme === action.id) activate('sombre')
        return ok(action.id)
      case 'import': {
        const folder = await pick(ctx, { title: 'Choisir le dossier du thème (il contient theme.json)', properties: ['openDirectory'] })
        if (!folder) return cancelled()
        const imported = await themes.importFrom(folder)
        activate(imported.id)
        return ok(imported.id)
      }
      case 'export': {
        const dest = await pick(ctx, { title: 'Choisir où enregistrer le thème', properties: ['openDirectory', 'createDirectory'] })
        if (!dest) return cancelled()
        return ok(await themes.exportTo(action.id, dest))
      }
    }
  }

  handle(IPC.profileAction, ProfileActionSchema, async (action) => {
    const result = await runProfile(action)
    broadcast(ctx)
    return result
  })

  handle(IPC.themeAction, ThemeActionSchema, async (action) => {
    const result = await runTheme(action)
    broadcast(ctx)
    return result
  })

  handle(IPC.updateSettings, SettingsPatchSchema, (patch) => {
    if (patch.autoStart !== undefined) {
      if (!app.isPackaged) throw new Error('Le démarrage avec Windows se règle dans l’application construite (npm run dist).')
      app.setLoginItemSettings({ openAtLogin: patch.autoStart })
    }
    config.update((c) => ({
      ...c,
      fullscreen: patch.fullscreen ?? c.fullscreen,
      homeBackdrop: patch.homeBackdrop ?? c.homeBackdrop,
      autoStart: patch.autoStart ?? c.autoStart,
      coverAccent: patch.coverAccent ?? c.coverAccent,
      sortRecent: patch.sortRecent ?? c.sortRecent,
      audio: { sfxVolume: patch.sfxVolume ?? c.audio.sfxVolume, muted: patch.muted ?? c.audio.muted },
      input: { swapConfirm: patch.swapConfirm ?? c.input.swapConfirm, rumble: patch.rumble ?? c.input.rumble }
    }))
    if (patch.fullscreen !== undefined) ctx.window()?.setFullScreen(patch.fullscreen)
    broadcast(ctx)
    return ok(null)
  })

  handle(IPC.renameGame, RenameGameSchema, ({ gameId, title }) => {
    ctx.library.rename(gameId, title)
    broadcast(ctx)
    return ok(null)
  })

  handle(IPC.sleep, ctx.noInput, () => {
    execFile('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], { windowsHide: true }, () => undefined)
  })
}
