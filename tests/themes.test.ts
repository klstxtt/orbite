import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { slugify, uniqueId } from '../src/main/themes/slug'
import { ThemeStore } from '../src/main/themes/store'
import { ConfigSchema, ThemeSchema } from '../src/shared/schemas'
import { BUILTIN_THEMES } from '../src/shared/themes'

let root: string
let store: ThemeStore

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cl-themes-'))
  store = new ThemeStore(join(root, 'themes'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const makeImage = async (name: string, width = 3000, height = 1500): Promise<string> => {
  const file = join(root, name)
  await sharp({ create: { width, height, channels: 3, background: '#224466' } }).png().toFile(file)
  return file
}

describe('slugify', () => {
  it('donne un identifiant de dossier sûr', () => {
    expect(slugify('Mon Thème d’été !')).toBe('mon-theme-d-ete')
    expect(slugify('  ../..\\Windows  ')).toBe('windows')
    expect(slugify('***')).toBe('theme')
    expect(slugify('x'.repeat(80)).length).toBeLessThanOrEqual(36)
  })

  it('uniqueId ajoute un numéro quand le nom est pris', () => {
    const taken = new Set(['nuit', 'nuit-2'])
    expect(uniqueId('nuit', (id) => taken.has(id))).toBe('nuit-3')
    expect(uniqueId('jour', (id) => taken.has(id))).toBe('jour')
  })
})

describe('thèmes fournis', () => {
  it('sont tous valides et listés en premier', () => {
    for (const theme of BUILTIN_THEMES) expect(ThemeSchema.safeParse(theme).success).toBe(true)
    expect(store.list().map((t) => t.id)).toEqual(BUILTIN_THEMES.map((t) => t.id))
  })

  it('ne se modifient pas et ne se suppriment pas', () => {
    expect(() => store.update('sombre', { name: 'Autre' })).toThrow(/copie/)
    expect(() => store.remove('clair')).toThrow()
  })

  it('un thème inconnu retombe sur le thème par défaut', () => {
    expect(store.get('nexiste-pas').id).toBe('sombre')
    expect(store.get('../../config').id).toBe('sombre')
  })
})

describe('thèmes de l’utilisateur', () => {
  it('crée une copie, la modifie, et la relit après redémarrage', async () => {
    const created = await store.create('Mon Thème', 'minuit')
    expect(created.id).toBe('mon-theme')
    expect(created.colors.background).toBe(store.get('minuit').colors.background)

    store.update(created.id, { scheme: 'light', accent: { a: '#111111', b: '#222222', c: '#333333' }, cursor: 'lueur', sounds: 'retro' })
    const reread = new ThemeStore(join(root, 'themes')).get('mon-theme')
    expect(reread).toMatchObject({ name: 'Mon Thème', scheme: 'light', cursor: 'lueur', sounds: 'retro' })
    expect(reread.colors).toMatchObject({ text: '#1c1d21', accentA: '#111111', accentC: '#333333' })
    expect(store.list().at(-1)?.id).toBe('mon-theme')
  })

  it('deux thèmes du même nom reçoivent des identifiants différents', async () => {
    const a = await store.create('Nuit', 'sombre')
    const b = await store.create('Nuit', 'sombre')
    expect([a.id, b.id]).toEqual(['nuit', 'nuit-2'])
  })

  it('convertit le fond d’écran en WebP de 2560 px au plus, puis le retire', async () => {
    const theme = await store.create('Fond', 'sombre')
    await store.setWallpaper(theme.id, await makeImage('grand.png'))
    const file = store.wallpaperPath(theme.id)
    expect(file).not.toBeNull()
    const meta = await sharp(file ?? '').metadata()
    expect([meta.format, meta.width]).toEqual(['webp', 2560])
    expect(store.wallpaperStamp(theme.id)).toBeGreaterThan(0)

    store.clearWallpaper(theme.id)
    expect(store.wallpaperPath(theme.id)).toBeNull()
    await expect(store.setWallpaper(theme.id, join(root, 'absent.png'))).rejects.toThrow(/image/)
  })

  it('supprime le dossier du thème', async () => {
    const theme = await store.create('Jetable', 'sombre')
    store.remove(theme.id)
    expect(existsSync(join(root, 'themes', theme.id))).toBe(false)
    expect(store.exists(theme.id)).toBe(false)
  })
})

describe('import et export', () => {
  it('fait l’aller-retour, fond d’écran compris', async () => {
    const theme = await store.create('Voyage', 'foret')
    await store.setWallpaper(theme.id, await makeImage('fond.png', 800, 600))
    const exported = await store.exportTo(theme.id, join(root, 'sortie'))
    expect(JSON.parse(readFileSync(join(exported, 'theme.json'), 'utf8'))).toMatchObject({ id: 'voyage', wallpaper: 'wallpaper.webp' })

    const other = new ThemeStore(join(root, 'autre-machine'))
    const imported = await other.importFrom(exported)
    expect(imported).toMatchObject({ id: 'voyage', name: 'Voyage' })
    expect(other.wallpaperPath('voyage')).not.toBeNull()
    // Un second import ne remplace pas le premier.
    expect((await other.importFrom(exported)).id).toBe('voyage-2')
  })

  it('un thème importé qui porte le nom d’un thème fourni reçoit un autre identifiant', async () => {
    const folder = join(root, 'entrant')
    mkdirSync(folder)
    writeFileSync(join(folder, 'theme.json'), JSON.stringify({ ...BUILTIN_THEMES[0], name: 'Faux sombre' }))
    expect((await store.importFrom(folder)).id).toBe('sombre-2')
  })

  it('refuse un dossier sans theme.json, un JSON invalide et un fond d’écran hors du dossier', async () => {
    const folder = join(root, 'mauvais')
    mkdirSync(folder)
    await expect(store.importFrom(folder)).rejects.toThrow(/theme\.json/)
    writeFileSync(join(folder, 'theme.json'), JSON.stringify({ id: 'x', name: 'X', colors: { background: 'rouge' } }))
    await expect(store.importFrom(folder)).rejects.toThrow(/invalide/)
    writeFileSync(join(folder, 'theme.json'), JSON.stringify({ ...BUILTIN_THEMES[0], id: 'x', wallpaper: '..\\..\\secret.png' }))
    await expect(store.importFrom(folder)).rejects.toThrow(/invalide/)
  })

  it('un fond d’écran illisible n’empêche pas l’import : le thème arrive sans fond', async () => {
    const folder = join(root, 'sans-image')
    mkdirSync(folder)
    writeFileSync(join(folder, 'theme.json'), JSON.stringify({ ...BUILTIN_THEMES[0], id: 'leger', wallpaper: 'absent.webp' }))
    const imported = await store.importFrom(folder)
    expect(imported).toMatchObject({ id: 'leger', wallpaper: '' })
  })
})

describe('config.json : nouveaux réglages', () => {
  it('une ancienne configuration reçoit les valeurs par défaut', () => {
    const config = ConfigSchema.parse({ profiles: [{ id: 'p1', name: 'Alex', color: '#2f6fe0' }] })
    expect(config).toMatchObject({ activeTheme: 'sombre', homeBackdrop: 'hero', autoStart: false })
    expect(config.profiles[0]?.avatar).toBe('')
  })
})
