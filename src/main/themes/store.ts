import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import sharp from 'sharp'
import { ThemeSchema, type Theme, type ThemePatch } from '../../shared/schemas'
import { BUILTIN_THEMES, DEFAULT_THEME_ID, SCHEME_BASE } from '../../shared/themes'
import { slugify, uniqueId } from './slug'

const WALLPAPER = 'wallpaper.webp'
const WALLPAPER_MAX = { width: 2560, height: 1440 }

sharp.cache(false)

/** Convertit n'importe quelle image en fond d'écran WebP, sans jamais l'agrandir. */
const toWallpaper = (source: string, dest: string): Promise<unknown> =>
  sharp(source, { failOn: 'none' })
    .rotate()
    .resize({ ...WALLPAPER_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(dest)

/**
 * Thèmes : ceux fournis avec le lanceur (en lecture seule) et ceux de l'utilisateur, un dossier par
 * thème dans `dir` (`theme.json` + fond d'écran facultatif). Les erreurs levées sont des messages
 * destinés à l'utilisateur.
 */
export class ThemeStore {
  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true })
  }

  isBuiltin(id: string): boolean {
    return BUILTIN_THEMES.some((t) => t.id === id)
  }

  private folder(id: string): string {
    return join(this.dir, id)
  }

  private readUser(id: string): Theme | null {
    try {
      const raw: unknown = JSON.parse(readFileSync(join(this.folder(id), 'theme.json'), 'utf8').replace(/^﻿/, ''))
      const parsed = ThemeSchema.safeParse(raw)
      // L'identifiant est celui du dossier : c'est lui qui fait foi.
      return parsed.success ? { ...parsed.data, id } : null
    } catch {
      return null
    }
  }

  /** Thèmes fournis d'abord, puis ceux de l'utilisateur par ordre alphabétique. */
  list(): Theme[] {
    const user: Theme[] = []
    for (const entry of readdirSync(this.dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || this.isBuiltin(entry.name) || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(entry.name)) continue
      const theme = this.readUser(entry.name)
      if (theme) user.push(theme)
    }
    return [...BUILTIN_THEMES, ...user.sort((a, b) => a.name.localeCompare(b.name))]
  }

  /** Le thème demandé, ou le thème par défaut s'il a disparu. */
  get(id: string): Theme {
    const found = BUILTIN_THEMES.find((t) => t.id === id) ?? (this.isSafeId(id) ? this.readUser(id) : null)
    return found ?? BUILTIN_THEMES.find((t) => t.id === DEFAULT_THEME_ID) ?? (BUILTIN_THEMES[0] as Theme)
  }

  exists(id: string): boolean {
    return this.isBuiltin(id) || (this.isSafeId(id) && this.readUser(id) !== null)
  }

  private isSafeId(id: string): boolean {
    return /^[a-z0-9][a-z0-9-]{0,39}$/.test(id)
  }

  private editable(id: string): Theme {
    if (this.isBuiltin(id)) throw new Error('Ce thème est fourni avec le lanceur : fais-en une copie pour le modifier.')
    const theme = this.isSafeId(id) ? this.readUser(id) : null
    if (!theme) throw new Error('Thème introuvable.')
    return theme
  }

  private save(theme: Theme): Theme {
    const valid = ThemeSchema.parse(theme)
    mkdirSync(this.folder(valid.id), { recursive: true })
    const file = join(this.folder(valid.id), 'theme.json')
    writeFileSync(`${file}.tmp`, JSON.stringify(valid, null, 2), 'utf8')
    renameSync(`${file}.tmp`, file)
    return valid
  }

  /** Chemin du fond d'écran d'un thème de l'utilisateur, ou null. */
  wallpaperPath(id: string): string | null {
    if (!this.isSafeId(id) || this.isBuiltin(id)) return null
    const theme = this.readUser(id)
    if (!theme?.wallpaper) return null
    const file = join(this.folder(id), theme.wallpaper)
    return existsSync(file) ? file : null
  }

  /** Marque de version du fond d'écran (date de modification), pour que l'affichage se rafraîchisse. */
  wallpaperStamp(id: string): number {
    const file = this.wallpaperPath(id)
    try {
      return file ? Math.round(statSync(file).mtimeMs) : 0
    } catch {
      return 0
    }
  }

  /** Copie `from` sous un nouveau nom, fond d'écran compris. */
  async create(name: string, fromId: string): Promise<Theme> {
    const source = this.get(fromId)
    const id = uniqueId(slugify(name), (candidate) => this.exists(candidate) || existsSync(this.folder(candidate)))
    const wallpaper = this.wallpaperPath(source.id)
    mkdirSync(this.folder(id), { recursive: true })
    if (wallpaper) await toWallpaper(wallpaper, join(this.folder(id), WALLPAPER))
    return this.save({ ...source, id, name, wallpaper: wallpaper ? WALLPAPER : '' })
  }

  update(id: string, patch: ThemePatch): Theme {
    const theme = this.editable(id)
    const colors = { ...theme.colors }
    if (patch.scheme) Object.assign(colors, SCHEME_BASE[patch.scheme])
    if (patch.accent) Object.assign(colors, { accentA: patch.accent.a, accentB: patch.accent.b, accentC: patch.accent.c })
    if (patch.select) colors.select = patch.select
    return this.save({
      ...theme,
      name: patch.name ?? theme.name,
      scheme: patch.scheme ?? theme.scheme,
      cursor: patch.cursor ?? theme.cursor,
      sounds: patch.sounds ?? theme.sounds,
      colors
    })
  }

  async setWallpaper(id: string, source: string): Promise<Theme> {
    const theme = this.editable(id)
    try {
      await toWallpaper(source, join(this.folder(id), WALLPAPER))
    } catch {
      throw new Error("Cette image n'a pas pu être lue.")
    }
    return this.save({ ...theme, wallpaper: WALLPAPER })
  }

  clearWallpaper(id: string): Theme {
    const theme = this.editable(id)
    rmSync(join(this.folder(id), WALLPAPER), { force: true })
    return this.save({ ...theme, wallpaper: '' })
  }

  remove(id: string): void {
    this.editable(id)
    rmSync(this.folder(id), { recursive: true, force: true })
  }

  /**
   * Importe un dossier de thème (`theme.json`, et son fond d'écran s'il en a un). Le thème reçoit un
   * identifiant libre ; son image est réencodée, jamais copiée telle quelle.
   */
  async importFrom(folder: string): Promise<Theme> {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(join(folder, 'theme.json'), 'utf8').replace(/^﻿/, ''))
    } catch {
      throw new Error('Ce dossier ne contient pas de fichier theme.json lisible.')
    }
    const parsed = ThemeSchema.safeParse(raw)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new Error(`Thème invalide (${issue ? `${issue.path.join('.')} : ${issue.message}` : 'format inattendu'}).`)
    }
    const id = uniqueId(parsed.data.id, (candidate) => this.exists(candidate) || existsSync(this.folder(candidate)))
    mkdirSync(this.folder(id), { recursive: true })
    let wallpaper = ''
    if (parsed.data.wallpaper) {
      try {
        await toWallpaper(join(folder, parsed.data.wallpaper), join(this.folder(id), WALLPAPER))
        wallpaper = WALLPAPER
      } catch {
        wallpaper = ''
      }
    }
    return this.save({ ...parsed.data, id, wallpaper })
  }

  /** Écrit le thème dans `<dest>/<id>/` (theme.json + fond d'écran) et renvoie ce dossier. */
  async exportTo(id: string, dest: string): Promise<string> {
    if (!this.exists(id)) throw new Error('Thème introuvable.')
    const theme = this.get(id)
    const target = join(dest, theme.id)
    mkdirSync(target, { recursive: true })
    const wallpaper = this.wallpaperPath(id)
    if (wallpaper) await toWallpaper(wallpaper, join(target, WALLPAPER))
    writeFileSync(join(target, 'theme.json'), JSON.stringify({ ...theme, wallpaper: wallpaper ? WALLPAPER : '' }, null, 2), 'utf8')
    return target
  }
}
