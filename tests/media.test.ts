import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mediaPathFromUrl, mediaUrl, removeArt, storeArt } from '../src/main/media/cache'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cl-media-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Image unie de la taille voulue, au format PNG. */
const makePng = async (name: string, width: number, height: number): Promise<string> => {
  const file = join(dir, name)
  await sharp({ create: { width, height, channels: 3, background: '#3366cc' } }).png().toFile(file)
  return file
}

describe('storeArt', () => {
  it('convertit une jaquette en WebP carré de 640 px', async () => {
    const name = await storeArt(dir, 'jeu1', 'cover', await makePng('grande.png', 1800, 1200))
    const meta = await sharp(join(dir, name)).metadata()
    expect(name).toMatch(/^jeu1-cover-[a-z0-9]+\.webp$/)
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 640, 640])
  })

  it('réduit un grand fond à 2560 px de large au plus, sans agrandir un petit', async () => {
    const big = await storeArt(dir, 'jeu1', 'hero', await makePng('4k.png', 3840, 2160))
    const small = await storeArt(dir, 'jeu2', 'hero', await makePng('petit.png', 1280, 720))
    expect((await sharp(join(dir, big)).metadata()).width).toBe(2560)
    expect((await sharp(join(dir, small)).metadata()).width).toBe(1280)
  })

  it('échoue sur un fichier qui n’est pas une image', async () => {
    await expect(storeArt(dir, 'jeu1', 'cover', join(dir, 'absent.png'))).rejects.toThrow()
  })

  it('removeArt supprime le fichier et ignore un nom vide', async () => {
    const name = await storeArt(dir, 'jeu1', 'cover', await makePng('a.png', 700, 700))
    removeArt(dir, name)
    removeArt(dir, '')
    expect(existsSync(join(dir, name))).toBe(false)
  })
})

describe('adresses media://', () => {
  it('fait l’aller-retour entre un fichier et son adresse', () => {
    expect(mediaUrl('')).toBeNull()
    const url = mediaUrl('jeu1-cover-abc.webp') ?? ''
    expect(mediaPathFromUrl(dir, url)).toBe(join(dir, 'jeu1-cover-abc.webp'))
  })

  it('refuse de sortir du dossier des images', () => {
    expect(mediaPathFromUrl(dir, 'media://art/..%2F..%2Fconfig.json')).toBeNull()
    expect(mediaPathFromUrl(dir, 'media://art/%2e%2e/secret.webp')).toBe(join(dir, 'secret.webp'))
    expect(mediaPathFromUrl(dir, 'media://autre/jeu1-cover-abc.webp')).toBeNull()
    expect(mediaPathFromUrl(dir, 'pas une adresse')).toBeNull()
  })
})
