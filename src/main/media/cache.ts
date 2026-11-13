import { rmSync } from 'fs'
import { basename, join } from 'path'
import sharp from 'sharp'

// Sans cache, sharp ne garde pas les fichiers ouverts : l'image d'origine reste déplaçable et supprimable.
sharp.cache(false)

export type ArtSlot = 'cover' | 'hero'

const COVER_PX = 640
const HERO_MAX = { width: 2560, height: 1440 }

/**
 * Convertit une image choisie par l'utilisateur en WebP à la bonne taille et la range dans `mediaDir`.
 * Une jaquette devient un carré de 640 px ; un fond est réduit à 2560×1440 au plus, sans agrandissement.
 * Le nom change à chaque fois pour que l'affichage ne garde pas l'ancienne image en cache.
 */
export async function storeArt(mediaDir: string, gameId: string, slot: ArtSlot, source: string): Promise<string> {
  const name = `${gameId}-${slot}-${Date.now().toString(36)}.webp`
  const image = sharp(source, { failOn: 'none' }).rotate()
  const sized =
    slot === 'cover'
      ? image.resize(COVER_PX, COVER_PX, { fit: 'cover', position: 'attention' })
      : image.resize({ ...HERO_MAX, fit: 'inside', withoutEnlargement: true })
  await sized.webp({ quality: slot === 'cover' ? 84 : 80 }).toFile(join(mediaDir, name))
  return name
}

/** Image de profil : carré de 256 px en WebP ; renvoie le nom du fichier créé dans `mediaDir`. */
export async function storeAvatar(mediaDir: string, profileId: string, source: string): Promise<string> {
  const name = `avatar-${profileId.replace(/[^\w-]/g, '')}-${Date.now().toString(36)}.webp`
  await sharp(source, { failOn: 'none' })
    .rotate()
    .resize(256, 256, { fit: 'cover', position: 'attention' })
    .webp({ quality: 86 })
    .toFile(join(mediaDir, name))
  return name
}

/** Jaquette en PNG carré de `size` pixels, pour l'icône de la fenêtre du jeu ; null sans jaquette. */
export async function coverIconPng(mediaDir: string, file: string, size = 256): Promise<Buffer | null> {
  if (!file) return null
  try {
    return await sharp(join(mediaDir, basename(file))).resize(size, size, { fit: 'cover' }).png().toBuffer()
  } catch {
    return null
  }
}

export function removeArt(mediaDir: string, file: string): void {
  if (!file) return
  rmSync(join(mediaDir, basename(file)), { force: true })
}

/** Adresse `media://` d'une image du cache, ou null. */
export const mediaUrl = (file: string): string | null => (file ? `media://art/${encodeURIComponent(file)}` : null)

/** Identifiant du thème d'une adresse `media://theme/<id>/wallpaper.webp`, ou null. */
export function themeIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const match = /^\/([a-z0-9][a-z0-9-]{0,39})\/wallpaper\.webp$/.exec(parsed.pathname)
    return parsed.host === 'theme' && match ? (match[1] ?? null) : null
  } catch {
    return null
  }
}

/** Chemin sur le disque d'une adresse `media://art/<fichier>` ; le nom est réduit à sa base (pas de `..`). */
export function mediaPathFromUrl(mediaDir: string, url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.host !== 'art') return null
    const name = basename(decodeURIComponent(parsed.pathname))
    return /^[\w-]+\.webp$/.test(name) ? join(mediaDir, name) : null
  } catch {
    return null
  }
}
