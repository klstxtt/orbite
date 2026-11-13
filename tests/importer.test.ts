import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanGameFiles, scanPcFolder, titleFromPath } from '../src/main/library/importer'
import { sortGames } from '../src/shared/types'

let root: string

/** Crée un fichier de `bytes` octets (les dossiers parents sont créés). */
const touch = (relative: string, bytes = 1): string => {
  const full = join(root, relative)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, Buffer.alloc(bytes))
  return full
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cl-import é '))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('titleFromPath', () => {
  it('retire l’extension, les mentions entre crochets ou parenthèses, et les séparateurs', () => {
    expect(titleFromPath('D:\\Jeux\\Mon_jeu.v2 [USA] (Rev 1).xyz')).toBe('Mon jeu v2')
    expect(titleFromPath('D:\\Jeux\\Été indien.nsp')).toBe('Été indien')
  })

  it('garde le nom d’un dossier entier, numéros de version compris', () => {
    expect(titleFromPath('D:\\Jeux\\Super.Jeu.2.5.xyz')).toBe('Super Jeu 2.5')
    expect(titleFromPath('D:\\Jeux\\Super Jeu 2.5', false)).toBe('Super Jeu 2.5')
  })

  it('ne renvoie jamais un titre vide', () => {
    expect(titleFromPath('D:\\Jeux\\[tag].bin')).toBe('[tag]')
  })
})

describe('scanPcFolder', () => {
  it('prend un jeu par sous-dossier : son plus gros programme, hors installeurs et utilitaires', () => {
    const game = touch('Aventure Été/bin/aventure.exe', 5000)
    touch('Aventure Été/unins000.exe', 9000)
    touch('Aventure Été/redist/vc_redist.x64.exe', 20000)
    touch('Aventure Été/bin/crashreporter.exe', 8000)
    touch('Aventure Été/outil.exe', 100)
    const second = touch('Course 2/course.exe', 10)
    touch('Dossier sans jeu/lisezmoi.txt')

    expect(scanPcFolder(root)).toEqual([
      { title: 'Aventure Été', path: game },
      { title: 'Course 2', path: second }
    ])
  })

  it('prend aussi les programmes posés directement dans le dossier', () => {
    const solo = touch('Petit Jeu.exe')
    touch('setup.exe')
    expect(scanPcFolder(root)).toEqual([{ title: 'Petit Jeu', path: solo }])
  })

  it('renvoie une liste vide pour un dossier absent', () => {
    expect(scanPcFolder(join(root, 'absent'))).toEqual([])
  })
})

describe('scanGameFiles', () => {
  it('avec des extensions : cherche sur deux niveaux, sans tenir compte de la casse', () => {
    const a = touch('Alpha (EU).ISO')
    const b = touch('Série/Bêta.rvz')
    touch('Série/trop/profond/Gamma.iso')
    touch('notes.txt')
    expect(scanGameFiles(root, ['iso', 'rvz'])).toEqual([
      { title: 'Alpha', path: a },
      { title: 'Bêta', path: b }
    ])
  })

  it('saute les dossiers ignorés du profil (update-old)', () => {
    const keep = touch('jeu.iso')
    touch('update-old/ancien.iso')
    touch('Update-Old/autre.iso')
    expect(scanGameFiles(root, ['iso'], ['update-old']).map((c) => c.path)).toEqual([keep])
  })

  it('sans extension connue : les fichiers du dossier lui-même, hors programmes, textes et images', () => {
    const a = touch('Jeu Un.xyz')
    const b = touch('Jeu Deux.abc')
    touch('lisezmoi.txt')
    touch('jaquette.png')
    touch('lanceur.exe')
    touch('sous-dossier/Jeu Trois.xyz')
    expect(scanGameFiles(root, [])).toEqual([
      { title: 'Jeu Deux', path: b },
      { title: 'Jeu Un', path: a }
    ])
  })
})

describe('sortGames', () => {
  const games = [
    { id: 'a', lastPlayed: 0 },
    { id: 'b', lastPlayed: 200 },
    { id: 'c', lastPlayed: 0 },
    { id: 'd', lastPlayed: 900 }
  ]

  it('met les jeux joués récemment en premier, les autres dans l’ordre d’ajout', () => {
    expect(sortGames(games, true).map((g) => g.id)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('garde l’ordre d’ajout quand le tri est coupé, sans toucher à la liste d’origine', () => {
    expect(sortGames(games, false).map((g) => g.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(games[0]?.id).toBe('a')
  })
})
