import { readdirSync, statSync, type Dirent } from 'fs'
import { basename, extname, join } from 'path'
import type { ImportCandidate } from '../../shared/types'

/** Programmes qui accompagnent un jeu sans être le jeu. */
const NOT_A_GAME = /unins|uninstall|setup|install|redist|vc_?redist|dxsetup|directx|crash|report|updater|helper|dotnet|easyanticheat|benchmark/i
/** Fichiers qui traînent dans un dossier de jeux sans être des jeux. */
const NOT_A_GAME_FILE = new Set(['txt', 'nfo', 'md', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'json', 'ini', 'cfg', 'log', 'url', 'lnk', 'db', 'xml', 'html', 'pdf', 'sav', 'bak'])
const PC_DEPTH = 3
const MAX_FILES = 5000

/** Titre lisible tiré d'un nom de fichier ou de dossier : « Mon_jeu.v2 [USA] (Rev 1).xyz » → « Mon jeu v2 ». */
export function titleFromPath(path: string, isFile = true): string {
  const name = isFile ? basename(path, extname(path)) : basename(path)
  const cleaned = name
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    // Un point entre deux chiffres est un numéro de version (« 2.5 »), pas un séparateur.
    .replace(/_+|(?<!\d)\.+|\.+(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || name).slice(0, 120)
}

function list(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

const size = (file: string): number => {
  try {
    return statSync(file).size
  } catch {
    return 0
  }
}

const hasIgnoredName = (name: string, ignoreDirs: readonly string[]): boolean =>
  ignoreDirs.some((d) => d.toLowerCase() === name.toLowerCase())

/** Tous les fichiers de `dir` jusqu'à `depth` niveaux, en sautant les dossiers ignorés. */
function walk(dir: string, depth: number, ignoreDirs: readonly string[], out: string[] = []): string[] {
  for (const entry of list(dir)) {
    if (out.length >= MAX_FILES) break
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (depth > 1 && !hasIgnoredName(entry.name, ignoreDirs)) walk(full, depth - 1, ignoreDirs, out)
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
  return out
}

const byTitle = (a: ImportCandidate, b: ImportCandidate): number => a.title.localeCompare(b.title)

/**
 * Jeux PC d'un dossier : un jeu par sous-dossier (son plus gros .exe qui n'est ni un installeur ni un
 * utilitaire), plus chaque .exe posé directement dans le dossier.
 */
export function scanPcFolder(dir: string): ImportCandidate[] {
  const isGameExe = (file: string): boolean => extname(file).toLowerCase() === '.exe' && !NOT_A_GAME.test(basename(file))
  const found: ImportCandidate[] = []
  for (const entry of list(dir)) {
    const full = join(dir, entry.name)
    if (entry.isFile()) {
      if (isGameExe(full)) found.push({ title: titleFromPath(full), path: full })
    } else if (entry.isDirectory()) {
      const best = walk(full, PC_DEPTH, [])
        .filter(isGameExe)
        .map((file) => ({ file, bytes: size(file) }))
        .sort((a, b) => b.bytes - a.bytes)[0]
      if (best) found.push({ title: titleFromPath(full, false), path: best.file })
    }
  }
  return found.sort(byTitle)
}

/**
 * Fichiers de jeu d'un dossier pour un émulateur. Avec des extensions : recherche sur deux niveaux.
 * Sans extension connue : tous les fichiers posés directement dans le dossier, hors textes et images.
 */
export function scanGameFiles(
  dir: string,
  extensions: readonly string[],
  ignoreDirs: readonly string[] = []
): ImportCandidate[] {
  const wanted = new Set(extensions.map((e) => e.toLowerCase()))
  const ext = (file: string): string => extname(file).slice(1).toLowerCase()
  const files =
    wanted.size > 0
      ? walk(dir, 2, ignoreDirs).filter((f) => wanted.has(ext(f)))
      : walk(dir, 1, ignoreDirs).filter((f) => ext(f) !== 'exe' && !NOT_A_GAME_FILE.has(ext(f)))
  return files.map((path) => ({ title: titleFromPath(path), path })).sort(byTitle)
}
