import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { storeArt } from '../src/main/media/cache'
import { downloadImage, isAllowedImageUrl, listImages, searchGames, type Fetch } from '../src/main/media/steamgrid'
import { ArtApplySchema, ArtKeySchema, ConfigSchema, LibrarySchema } from '../src/shared/schemas'

const CDN = 'https://cdn2.steamgriddb.com'
const json = (data: unknown, status = 200): Response => new Response(JSON.stringify({ success: status === 200, data }), { status })

/** Faux réseau : note chaque appel et répond d'après le chemin demandé. */
function fakeFetch(routes: Record<string, () => Response>): { fetch: Fetch; calls: Array<{ url: string; auth: string | null }> } {
  const calls: Array<{ url: string; auth: string | null }> = []
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, auth: new Headers(init?.headers).get('authorization') })
    const route = Object.keys(routes).find((part) => url.includes(part))
    return route ? (routes[route] as () => Response)() : json([], 404)
  }
  return { fetch, calls }
}

describe('recherche de jeux', () => {
  it('envoie la clé en en-tête, encode le nom et lit l’année', async () => {
    const net = fakeFetch({ '/search/autocomplete/': () => json([{ id: 7, name: 'Néon Rally', release_date: 1_600_000_000 }, { id: 8, name: 'Sans date' }]) })
    const games = await searchGames('ma-cle-secrete-1234', ' Néon Rally & Co ', net.fetch)
    expect(games).toEqual([
      { id: 7, name: 'Néon Rally', year: 2020 },
      { id: 8, name: 'Sans date', year: null }
    ])
    expect(net.calls[0]?.auth).toBe('Bearer ma-cle-secrete-1234')
    expect(net.calls[0]?.url).toContain('/search/autocomplete/N%C3%A9on%20Rally%20%26%20Co')
    expect(net.calls[0]?.url).not.toContain('ma-cle')
  })

  it('donne un message clair : pas de clé, clé refusée, panne réseau, réponse illisible', async () => {
    await expect(searchGames('', 'x', fakeFetch({}).fetch)).rejects.toThrow(/Aucune clé/)
    await expect(searchGames('k', 'x', fakeFetch({ '/search/': () => json(null, 401) }).fetch)).rejects.toThrow(/refuse cette clé/)
    await expect(searchGames('k', 'x', async () => Promise.reject(new Error('hors ligne')))).rejects.toThrow(/ne répond pas/)
    await expect(searchGames('k', 'x', fakeFetch({ '/search/': () => new Response('<html>', { status: 200 }) }).fetch)).rejects.toThrow(/illisible/)
    await expect(searchGames('k', 'x', fakeFetch({ '/search/': () => json([], 500) }).fetch)).rejects.toThrow(/500/)
  })
})

describe('images proposées', () => {
  const image = (n: number, host = CDN): { url: string; thumb: string } => ({ url: `${host}/grid/${n}.png`, thumb: `${host}/thumb/${n}.jpg` })

  it('demande d’abord les jaquettes carrées, puis toutes s’il n’y en a aucune', async () => {
    const square = fakeFetch({ 'dimensions=': () => json([image(1), image(2)]) })
    expect(await listImages('k', 42, 'cover', square.fetch)).toHaveLength(2)
    expect(square.calls).toHaveLength(1)

    const none = fakeFetch({ 'dimensions=': () => json([]), '/grids/game/42': () => json([image(3)]) })
    expect(await listImages('k', 42, 'cover', none.fetch)).toEqual([image(3)])
    expect(none.calls).toHaveLength(2)
  })

  it('utilise les bons chemins pour le fond et le logo, et un jeu inconnu ne donne rien', async () => {
    const net = fakeFetch({ '/heroes/game/5': () => json([image(1)]), '/logos/game/5': () => json([image(2)]) })
    expect(await listImages('k', 5, 'hero', net.fetch)).toEqual([image(1)])
    expect(await listImages('k', 5, 'logo', net.fetch)).toEqual([image(2)])
    expect(await listImages('k', 999, 'hero', net.fetch)).toEqual([])
  })

  it('écarte les images hébergées ailleurs et se limite à 24 propositions', async () => {
    const many = Array.from({ length: 40 }, (_, n) => image(n))
    const net = fakeFetch({ '/heroes/': () => json([image(100, 'https://exemple.test'), ...many]) })
    const list = await listImages('k', 5, 'hero', net.fetch)
    expect(list).toHaveLength(24)
    expect(list.every((i) => i.url.startsWith(CDN))).toBe(true)
  })

  it('n’accepte que des adresses HTTPS de steamgriddb.com', () => {
    expect(isAllowedImageUrl(`${CDN}/grid/a.png`)).toBe(true)
    expect(isAllowedImageUrl('http://cdn2.steamgriddb.com/grid/a.png')).toBe(false)
    expect(isAllowedImageUrl('https://steamgriddb.com.exemple.test/a.png')).toBe(false)
    expect(isAllowedImageUrl('https://faux-steamgriddb.com/a.png')).toBe(false)
    expect(isAllowedImageUrl('file:///C:/Windows/win.ini')).toBe(false)
    expect(isAllowedImageUrl('pas une adresse')).toBe(false)
  })
})

describe('téléchargement', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cl-sgdb-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('refuse une autre adresse sans rien demander au réseau, et signale un échec', async () => {
    const net = fakeFetch({})
    await expect(downloadImage('https://exemple.test/a.png', net.fetch)).rejects.toThrow(/refusée/)
    expect(net.calls).toHaveLength(0)
    await expect(downloadImage(`${CDN}/grid/absent.png`, net.fetch)).rejects.toThrow(/404/)
    await expect(downloadImage(`${CDN}/grid/vide.png`, async () => new Response(new Uint8Array(0)))).rejects.toThrow(/vide/)
  })

  it('une image téléchargée devient un logo WebP transparent de 1000 px au plus', async () => {
    const png = await sharp({ create: { width: 2000, height: 600, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
    const bytes = await downloadImage(`${CDN}/logo/1.png`, async () => new Response(new Uint8Array(png)))
    const name = await storeArt(dir, 'jeu1', 'logo', bytes)
    const meta = await sharp(join(dir, name)).metadata()
    expect(name).toMatch(/^jeu1-logo-[a-z0-9]+\.webp$/)
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(['webp', 1000, 300, true])
  })
})

describe('schémas', () => {
  it('une ancienne configuration n’a pas de clé, une ancienne bibliothèque pas de logo', () => {
    expect(ConfigSchema.parse({}).steamGridDbKey).toBe('')
    const library = LibrarySchema.parse({ games: [{ id: 'a', title: 'A', kind: 'pc', exe: 'C:/a.exe', art: { cover: 'a.webp' } }] })
    expect(library.games[0]?.art).toEqual({ cover: 'a.webp', hero: '', logo: '', accent: '' })
  })

  it('valide les requêtes du rendu', () => {
    expect(ArtKeySchema.safeParse({ type: 'set', key: '' }).success).toBe(false)
    expect(ArtKeySchema.safeParse({ type: 'paste' }).success).toBe(true)
    expect(ArtApplySchema.safeParse({ gameId: 'a', slot: 'logo', url: `${CDN}/logo/1.png` }).success).toBe(true)
    expect(ArtApplySchema.safeParse({ gameId: 'a', slot: 'icone', url: `${CDN}/logo/1.png` }).success).toBe(false)
    expect(ArtApplySchema.safeParse({ gameId: 'a', slot: 'logo', url: 'pas une adresse' }).success).toBe(false)
  })
})
