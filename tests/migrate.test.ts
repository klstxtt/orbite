import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateDataDir } from '../src/main/store/migrate'

let root: string
let oldDir: string
let newDir: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cl-migrate-'))
  oldDir = join(root, 'ancien')
  newDir = join(root, 'Orbite')
  mkdirSync(join(oldDir, 'media'), { recursive: true })
  mkdirSync(join(oldDir, 'Cache'), { recursive: true })
  writeFileSync(join(oldDir, 'config.json'), '{"onboarded":true}')
  writeFileSync(join(oldDir, 'library.json'), '{"games":[]}')
  writeFileSync(join(oldDir, 'library.json.bak'), '{}')
  writeFileSync(join(oldDir, 'media', 'a-cover.webp'), 'img')
  writeFileSync(join(oldDir, 'Cache', 'data_0'), 'chromium')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('migrateDataDir', () => {
  it('copie la bibliothèque et les images, pas le cache de Chromium, et garde l’ancien dossier', () => {
    expect(migrateDataDir(oldDir, newDir)).toBe(4)
    expect(readFileSync(join(newDir, 'config.json'), 'utf8')).toBe('{"onboarded":true}')
    expect(existsSync(join(newDir, 'library.json.bak'))).toBe(true)
    expect(existsSync(join(newDir, 'media', 'a-cover.webp'))).toBe(true)
    expect(existsSync(join(newDir, 'Cache'))).toBe(false)
    expect(existsSync(join(oldDir, 'config.json'))).toBe(true)
  })

  it('ne touche à rien si le nouveau dossier a déjà sa config', () => {
    mkdirSync(newDir)
    writeFileSync(join(newDir, 'config.json'), '{"onboarded":false}')
    expect(migrateDataDir(oldDir, newDir)).toBe(0)
    expect(readFileSync(join(newDir, 'config.json'), 'utf8')).toBe('{"onboarded":false}')
    expect(existsSync(join(newDir, 'library.json'))).toBe(false)
  })

  it('ne fait rien sans ancien dossier', () => {
    expect(migrateDataDir(join(root, 'absent'), newDir)).toBe(0)
  })
})
