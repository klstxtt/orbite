import { app, dialog, ipcMain, type BrowserWindow, type OpenDialogOptions } from 'electron'
import { existsSync } from 'fs'
import { z } from 'zod'
import { IPC } from '../../shared/ipc'
import {
  ArtRequestSchema,
  IdSchema,
  ImportRequestSchema,
  ScanRequestSchema,
  type EmulatorProfile
} from '../../shared/schemas'
import { cancelled, fail, ok, type AppState, type GameState, type Result } from '../../shared/types'
import { isIgnoredPath, matchesExeName } from '../emulators/profiles'
import type { Launcher } from '../launch/launcher'
import { scanGameFiles, scanPcFolder } from '../library/importer'
import type { LibraryService } from '../library/service'
import { coverAccent, coverIconPng, mediaUrl, removeArt, storeArt } from '../media/cache'
import type { Stores } from '../store/stores'
import type { ThemeStore } from '../themes/store'
import { registerSettingsIpc } from './settings'
import { readSystemStatus } from '../system/status'

export interface AppContext {
  stores: Stores
  library: LibraryService
  themes: ThemeStore
  /** Schéma des canaux sans paramètre. */
  noInput: z.ZodUndefined
  profiles: () => readonly EmulatorProfile[]
  launcher: Launcher
  window: () => BrowserWindow | null
  gameState: () => GameState
  /** Messages en attente, montrés une fois au rendu. */
  notices: string[]
}

export function buildState(ctx: AppContext): AppState {
  const config = ctx.stores.config.get()
  const stats = ctx.stores.stats.get()
  return {
    games: ctx.library.games().map((g) => ({
      id: g.id,
      title: g.title,
      kind: g.kind,
      cover: mediaUrl(g.art.cover),
      hero: mediaUrl(g.art.hero),
      accent: g.art.accent || null,
      available: ctx.library.isAvailable(g),
      lastPlayed: stats.lastPlayed[g.id] ?? 0,
      playtime: stats.playtime[`${config.activeProfile}|${g.id}`] ?? 0
    })),
    emulators: ctx.profiles().map((p) => {
      const exePath = ctx.library.emulatorExe(p.id)
      return { id: p.id, name: p.name, exePath, configured: exePath !== '' && existsSync(exePath) }
    }),
    profiles: config.profiles.map((p) => ({ id: p.id, name: p.name, color: p.color, avatar: mediaUrl(p.avatar) })),
    activeProfile: config.activeProfile,
    settings: {
      sfxVolume: config.audio.sfxVolume,
      muted: config.audio.muted,
      swapConfirm: config.input.swapConfirm,
      fullscreen: config.fullscreen,
      homeBackdrop: config.homeBackdrop,
      autoStart: config.autoStart,
      coverAccent: config.coverAccent,
      sortRecent: config.sortRecent
    },
    themes: ctx.themes.list().map((t) => {
      const stamp = ctx.themes.wallpaperStamp(t.id)
      return {
        ...t,
        builtin: ctx.themes.isBuiltin(t.id),
        wallpaperUrl: stamp ? `media://theme/${t.id}/wallpaper.webp?v=${stamp}` : null
      }
    }),
    activeTheme: ctx.themes.exists(config.activeTheme) ? config.activeTheme : 'sombre',
    onboarded: config.onboarded,
    gameState: ctx.gameState(),
    notices: ctx.notices
  }
}

/** Envoie l'état complet au rendu ; à appeler après tout changement. */
export function broadcast(ctx: AppContext): void {
  const win = ctx.window()
  if (win && !win.isDestroyed()) win.webContents.send(IPC.stateChanged, buildState(ctx))
}

/** Fenêtre de choix de fichier ou de dossier ; null si l'utilisateur annule. */
export async function pick(ctx: AppContext, options: OpenDialogOptions): Promise<string | null> {
  const win = ctx.window()
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

/** Lance un jeu de la bibliothèque ; lève une erreur lisible si quelque chose manque. */
export async function launchGame(ctx: AppContext, gameId: string): Promise<void> {
  const game = ctx.library.find(gameId)
  const command = ctx.library.command(game)
  ctx.launcher.launch({
    gameId,
    title: game.title,
    command,
    profile: game.kind === 'emulated' ? ctx.library.profile(game.emulatorId) : null,
    iconPng: await coverIconPng(ctx.stores.mediaDir, game.art.cover)
  })
}

/** Jaquettes enregistrées avant l'arrivée des couleurs d'accent : calcule la leur une fois. */
async function backfillAccents(ctx: AppContext): Promise<void> {
  let changed = false
  for (const game of ctx.library.games()) {
    if (!game.art.cover || game.art.accent) continue
    const accent = await coverAccent(ctx.stores.mediaDir, game.art.cover)
    if (!accent) continue
    ctx.library.setAccent(game.id, accent)
    changed = true
  }
  if (changed) broadcast(ctx)
}

const NO_INPUT = z.undefined()

/** Enregistre un canal dont l'entrée est validée par un schéma. */
export type Handle = <S extends z.ZodType>(
  channel: string,
  schema: S,
  run: (input: z.infer<S>) => unknown | Promise<unknown>
) => void

export function registerIpc(ctx: AppContext): void {
  /**
   * Enregistre un canal : l'entrée est validée par `schema` avant tout traitement, et une erreur levée
   * devient un résultat `{ ok: false }` avec son message.
   */
  const handle: Handle = (channel, schema, run) => {
    ipcMain.handle(channel, async (_event, raw: unknown) => {
      const parsed = schema.safeParse(raw)
      if (!parsed.success) return fail('Requête invalide.')
      try {
        return await run(parsed.data)
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err))
      }
    })
  }

  /** Demande l'exécutable d'un émulateur et l'enregistre. */
  const locateEmulator = async (emulatorId: string): Promise<Result> => {
    const profile = ctx.library.profile(emulatorId)
    const exe = await pick(ctx, {
      title: `Où est ${profile.name} ? (${profile.exeNames.join(', ')})`,
      properties: ['openFile'],
      filters: [{ name: 'Programmes', extensions: ['exe'] }]
    })
    if (!exe) return cancelled()
    if (isIgnoredPath(profile, exe)) {
      return fail(`Ce programme est dans un dossier à éviter (${profile.ignoreDirs.join(', ')}) : choisis celui du dossier principal.`)
    }
    if (!matchesExeName(profile, exe)) return fail(`Le programme attendu s'appelle ${profile.exeNames.join(' ou ')}.`)
    ctx.stores.config.update((c) => ({ ...c, emulators: { ...c.emulators, [emulatorId]: { exePath: exe } } }))
    broadcast(ctx)
    return ok(null)
  }

  const emulatorReady = (emulatorId: string): boolean => {
    const exe = ctx.library.emulatorExe(emulatorId)
    return exe !== '' && existsSync(exe)
  }

  handle(IPC.systemStatus, NO_INPUT, () => readSystemStatus())
  handle(IPC.toggleFullscreen, NO_INPUT, () => {
    const win = ctx.window()
    if (win) win.setFullScreen(!win.isFullScreen())
  })
  handle(IPC.quit, NO_INPUT, () => app.quit())

  handle(IPC.getState, NO_INPUT, () => {
    const state = buildState(ctx)
    ctx.notices = []
    return state
  })
  handle(IPC.setOnboarded, NO_INPUT, () => {
    ctx.stores.config.update((c) => ({ ...c, onboarded: true }))
    broadcast(ctx)
  })

  handle(IPC.addPcGame, NO_INPUT, async () => {
    const exe = await pick(ctx, {
      title: 'Choisir le programme du jeu',
      properties: ['openFile'],
      filters: [{ name: 'Programmes', extensions: ['exe'] }]
    })
    if (!exe) return cancelled()
    const game = ctx.library.addPc(exe)
    broadcast(ctx)
    return ok(game.id)
  })

  handle(IPC.locateEmulator, IdSchema, locateEmulator)

  handle(IPC.addEmulatedGame, IdSchema, async (emulatorId) => {
    const profile = ctx.library.profile(emulatorId)
    if (!emulatorReady(emulatorId)) {
      const located = await locateEmulator(emulatorId)
      if (!located.ok) return located
    }
    const extensions = profile.gameExtensions
    const file = await pick(ctx, {
      title: `Choisir le fichier du jeu (${profile.name})`,
      properties: ['openFile'],
      filters: [
        ...(extensions.length > 0 ? [{ name: `Jeux ${profile.name}`, extensions: [...extensions] }] : []),
        { name: 'Tous les fichiers', extensions: ['*'] }
      ]
    })
    if (!file) return cancelled()
    const game = ctx.library.addEmulated(emulatorId, file)
    broadcast(ctx)
    return ok(game.id)
  })

  handle(IPC.scanFolder, ScanRequestSchema, async (request) => {
    if (request.kind === 'emulated' && !emulatorReady(request.emulatorId)) {
      const located = await locateEmulator(request.emulatorId)
      if (!located.ok) return located
    }
    const dir = await pick(ctx, { title: 'Choisir le dossier à importer', properties: ['openDirectory'] })
    if (!dir) return cancelled()
    const found =
      request.kind === 'pc'
        ? scanPcFolder(dir)
        : scanGameFiles(dir, ctx.library.profile(request.emulatorId).gameExtensions, ctx.library.profile(request.emulatorId).ignoreDirs)
    return ok({ dir, candidates: found.filter((c) => !ctx.library.has(c.path)) })
  })

  handle(IPC.importGames, ImportRequestSchema, (request) => {
    let added = 0
    for (const path of request.paths) {
      if (!existsSync(path) || ctx.library.has(path)) continue
      if (request.kind === 'pc') ctx.library.addPc(path)
      else ctx.library.addEmulated(request.emulatorId, path)
      added++
    }
    broadcast(ctx)
    return ok(added)
  })

  handle(IPC.setGameArt, ArtRequestSchema, async ({ gameId, slot }) => {
    ctx.library.find(gameId)
    const source = await pick(ctx, {
      title: slot === 'cover' ? 'Choisir la jaquette (image carrée de préférence)' : 'Choisir la grande image de fond',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'tif', 'tiff'] }]
    })
    if (!source) return cancelled()
    let file: string
    try {
      file = await storeArt(ctx.stores.mediaDir, gameId, slot, source)
    } catch {
      return fail("Cette image n'a pas pu être lue.")
    }
    removeArt(ctx.stores.mediaDir, ctx.library.setArt(gameId, slot, file))
    if (slot === 'cover') ctx.library.setAccent(gameId, await coverAccent(ctx.stores.mediaDir, file))
    broadcast(ctx)
    return ok(null)
  })

  handle(IPC.removeGame, IdSchema, (gameId) => {
    for (const file of ctx.library.remove(gameId)) removeArt(ctx.stores.mediaDir, file)
    broadcast(ctx)
    return ok(null)
  })

  handle(IPC.launchGame, IdSchema, async (gameId) => {
    await launchGame(ctx, gameId)
    return ok(null)
  })
  handle(IPC.stopGame, NO_INPUT, () => ctx.launcher.stop())

  registerSettingsIpc(ctx, handle)
  void backfillAccents(ctx)
}
