import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildCommand, isIgnoredPath, loadProfiles, matchesExeName, parseProfile } from '../src/main/emulators/profiles'
import { substituteArgs } from '../src/shared/args'
import { joinArgs, splitArgs } from '../src/shared/args'

const minimal = { id: 'demo', name: 'Démo', exeNames: ['demo.exe'], args: ['{game}'] }
const parse = (value: unknown): ReturnType<typeof parseProfile> => parseProfile(JSON.stringify(value))

describe('substituteArgs', () => {
  it('remplace {game} sans rien échapper : espaces, accents, guillemets, $ et & restent un seul argument', () => {
    const game = 'D:\\Jeux à moi\\L\'été "spécial" & co $1 (v2).xyz'
    expect(substituteArgs(['-f', '-g', '{game}'], { game })).toEqual(['-f', '-g', game])
  })

  it('remplace à l’intérieur d’un argument et plusieurs fois', () => {
    expect(substituteArgs(['--rom={game}', '{game}|{game}'], { game: 'a b' })).toEqual(['--rom=a b', 'a b|a b'])
  })

  it('laisse un nom inconnu tel quel et ne touche pas au tableau d’origine', () => {
    const args = ['{inconnu}', '{game}'] as const
    expect(substituteArgs(args, { game: 'x' })).toEqual(['{inconnu}', 'x'])
    expect(args).toEqual(['{inconnu}', '{game}'])
  })

  it('ne réinterprète pas un chemin qui contient lui-même {game}', () => {
    expect(substituteArgs(['{game}'], { game: 'C:\\{game}\\jeu.bin' })).toEqual(['C:\\{game}\\jeu.bin'])
  })
})

describe('parseProfile', () => {
  it('accepte un profil minimal et remplit les valeurs par défaut', () => {
    const result = parse(minimal)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.ignoreDirs).toEqual([])
    expect(result.profile.ready.settleMs).toBe(1500)
    expect(result.profile.dialogs).toEqual([])
  })

  it('normalise les extensions', () => {
    const result = parse({ ...minimal, gameExtensions: ['.ISO', ' rvz ', ''] })
    expect(result.ok && result.profile.gameExtensions).toEqual(['iso', 'rvz'])
  })

  it('lit le profil Fritchii fourni', () => {
    const result = parseProfile(readFileSync(join(__dirname, '..', 'resources', 'emulators', 'fritchii.json'), 'utf8'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.profile.args).toEqual(['-f', '-g', '{game}'])
    expect(result.profile.ignoreDirs).toContain('update-old')
    expect(result.profile.dialogs[0]?.answer).toBe('yes')
  })

  it.each([
    ['JSON invalide', '{'],
    ['arguments sans {game}', JSON.stringify({ ...minimal, args: ['-f'] })],
    ['identifiant invalide', JSON.stringify({ ...minimal, id: 'Mon Émulateur' })],
    ['aucun nom d’exécutable', JSON.stringify({ ...minimal, exeNames: [] })],
    ['expression régulière invalide', JSON.stringify({ ...minimal, ready: { title: '(' } })],
    ['réponse de dialogue inconnue', JSON.stringify({ ...minimal, dialogs: [{ match: 'x', answer: 'peut-être' }] })]
  ])('refuse : %s', (_label, text) => {
    const result = parseProfile(text)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0)
  })
})

describe('chemins et ligne de commande', () => {
  const profile = (() => {
    const result = parse({ ...minimal, id: 'fx', exeNames: ['Lichii.exe'], ignoreDirs: ['update-old'], args: ['-f', '-g', '{game}'] })
    if (!result.ok) throw new Error(result.error)
    return result.profile
  })()

  it('écarte l’exécutable gardé dans update-old, quelle que soit la casse', () => {
    expect(isIgnoredPath(profile, 'D:\\Emu\\Fritchii\\update-old\\lichii.exe')).toBe(true)
    expect(isIgnoredPath(profile, 'D:\\Emu\\Fritchii\\Update-Old\\sous\\lichii.exe')).toBe(true)
    expect(isIgnoredPath(profile, 'D:\\Emu\\Fritchii\\lichii.exe')).toBe(false)
    // Un nom de fichier ou un dossier qui ressemble ne compte pas.
    expect(isIgnoredPath(profile, 'D:\\Emu\\update-old-2\\lichii.exe')).toBe(false)
  })

  it('reconnaît le nom de l’exécutable sans tenir compte de la casse', () => {
    expect(matchesExeName(profile, 'D:\\Emu\\LICHII.EXE')).toBe(true)
    expect(matchesExeName(profile, 'D:\\Emu\\autre.exe')).toBe(false)
  })

  it('construit la commande : arguments du profil, puis ceux du jeu, dossier de l’émulateur comme dossier de travail', () => {
    const exe = 'D:\\Mes émulateurs\\Fritchii\\lichii.exe'
    const game = 'E:\\Jeux Switch\\Été indien (FR).nsp'
    expect(buildCommand(profile, exe, game, ['--extra'])).toEqual({
      exe,
      args: ['-f', '-g', game, '--extra'],
      cwd: 'D:\\Mes émulateurs\\Fritchii'
    })
  })
})

describe('loadProfiles', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cl-emu-'))
    mkdirSync(join(dir, 'fournis'))
    mkdirSync(join(dir, 'perso'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('le profil de l’utilisateur remplace le profil fourni, et un fichier invalide est signalé sans bloquer', () => {
    writeFileSync(join(dir, 'fournis', 'demo.json'), JSON.stringify(minimal))
    writeFileSync(join(dir, 'perso', 'demo.json'), JSON.stringify({ ...minimal, name: 'Démo perso' }))
    writeFileSync(join(dir, 'perso', 'casse.json'), '{')
    writeFileSync(join(dir, 'perso', 'notes.txt'), 'ignoré')

    const { profiles, errors } = loadProfiles([join(dir, 'fournis'), join(dir, 'perso'), join(dir, 'absent')])
    expect(profiles.map((p) => p.name)).toEqual(['Démo perso'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('casse.json')
  })
})

describe('arguments tapés par l’utilisateur', () => {
  it('découpe sur les espaces et garde ensemble ce qui est entre guillemets', () => {
    expect(splitArgs('  -fullscreen   --dossier "Mes jeux/Été" -x=1 ')).toEqual(['-fullscreen', '--dossier', 'Mes jeux/Été', '-x=1'])
    expect(splitArgs('')).toEqual([])
    expect(splitArgs('""')).toEqual([''])
  })

  it('joinArgs redonne une ligne que splitArgs relit à l’identique', () => {
    const args = ['-g', 'C:\\Jeux\\Mon jeu.exe', '', '--vite']
    expect(splitArgs(joinArgs(args))).toEqual(args)
  })
})
