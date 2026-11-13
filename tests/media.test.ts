import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { coverAccent, mediaPathFromUrl, mediaUrl, removeArt, storeArt } from '../src/main/media/cache'
import { accentTriple, hexToHsl, hslToHex, vividAccent } from '../src/shared/color'

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

describe('couleur d’accent', () => {
  /** Pixels RVB : `share` de la couleur donnée, le reste en gris foncé. */
  const pixels = (rgb: [number, number, number], share: number, total = 1000): Uint8Array => {
    const out = new Uint8Array(total * 3).fill(30)
    for (let i = 0; i < total * share; i++) out.set(rgb, i * 3)
    return out
  }

  it('garde la teinte de la zone colorée, même petite face à un fond sombre', () => {
    const [h, s, l] = hexToHsl(vividAccent(pixels([220, 30, 40], 0.15), 3))
    expect(h > 345 || h < 15).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0.6)
    expect(l).toBeGreaterThan(0.5)
  })

  it('ne donne rien pour une image grise ou vide', () => {
    expect(vividAccent(pixels([128, 128, 128], 1), 3)).toBe('')
    expect(vividAccent(new Uint8Array(0), 3)).toBe('')
  })

  it('le dégradé tourne autour de la couleur et reste en #rrggbb', () => {
    const { a, b, c } = accentTriple('#3366cc')
    for (const hex of [a, b, c]) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(b).toBe('#3366cc')
    expect(hslToHex(0, 1, 0.5)).toBe('#ff0000')
  })

  it('lit la couleur d’une jaquette du cache', async () => {
    const name = await storeArt(dir, 'jeu1', 'cover', await makePng('bleu.png', 400, 400))
    const [h] = hexToHsl(await coverAccent(dir, name))
    expect(Math.abs(h - 220)).toBeLessThan(12)
    expect(await coverAccent(dir, 'absent.webp')).toBe('')
    expect(await coverAccent(dir, '')).toBe('')
  })
})
