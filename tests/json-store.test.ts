import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JsonStore } from '../src/main/store/JsonStore'
import { ConfigSchema, LibrarySchema } from '../src/shared/schemas'

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cl-store-'))
  file = join(dir, 'config.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const setAside = (): string[] => readdirSync(dir).filter((f) => f.includes('.casse-'))

describe('JsonStore', () => {
  it('donne les valeurs par défaut sans fichier, et ne crée rien tant qu’on n’écrit pas', () => {
    const store = new JsonStore(file, ConfigSchema)
    expect(store.get().onboarded).toBe(false)
    expect(store.get().profiles).toHaveLength(1)
    expect(store.recovery).toBeNull()
    expect(existsSync(file)).toBe(false)
  })

  it('complète les clés absentes et tolère le BOM', () => {
    writeFileSync(file, '﻿{"onboarded": true}', 'utf8')
    const store = new JsonStore(file, ConfigSchema)
    expect(store.get().onboarded).toBe(true)
    expect(store.get().audio.sfxVolume).toBe(70)
    expect(store.recovery).toBeNull()
  })

  it('écrit de façon atomique et garde une copie de secours de l’état précédent', () => {
    const store = new JsonStore(file, ConfigSchema)
    store.update((c) => ({ ...c, onboarded: true }))
    expect(existsSync(`${file}.tmp`)).toBe(false)
    expect(existsSync(`${file}.bak`)).toBe(false)

    store.update((c) => ({ ...c, activeProfile: 'p2' }))
    const backup = JSON.parse(readFileSync(`${file}.bak`, 'utf8')) as { activeProfile: string }
    expect(backup.activeProfile).toBe('p1')
    expect(new JsonStore(file, ConfigSchema).get().activeProfile).toBe('p2')
  })

  it('met de côté un fichier corrompu et reprend la copie de secours', () => {
    const store = new JsonStore(file, ConfigSchema)
    store.update((c) => ({ ...c, onboarded: true }))
    store.update((c) => ({ ...c, activeProfile: 'p2' }))
    writeFileSync(file, '{"onboarded": tr', 'utf8')

    const reopened = new JsonStore(file, ConfigSchema)
    expect(reopened.get().onboarded).toBe(true)
    expect(reopened.recovery).toContain('copie de secours')
    expect(setAside()).toHaveLength(1)
    expect(readFileSync(join(dir, setAside()[0] ?? ''), 'utf8')).toBe('{"onboarded": tr')
  })

  it('revient aux valeurs par défaut sans copie de secours, sans écraser le fichier abîmé', () => {
    writeFileSync(file, 'pas du json', 'utf8')
    const store = new JsonStore(file, ConfigSchema)
    expect(store.get().onboarded).toBe(false)
    expect(store.recovery).toContain('valeurs par défaut')
    expect(readFileSync(file, 'utf8')).toBe('pas du json')
    expect(setAside()).toHaveLength(1)
  })

  it('traite un JSON valide mais hors schéma comme un fichier abîmé', () => {
    writeFileSync(file, '{"profiles": "oups"}', 'utf8')
    const store = new JsonStore(file, ConfigSchema)
    expect(store.get().profiles).toHaveLength(1)
    expect(store.recovery).not.toBeNull()
  })

  it('ne remplace jamais la copie de secours par un fichier abîmé', () => {
    const store = new JsonStore(file, ConfigSchema)
    store.update((c) => ({ ...c, onboarded: true }))
    store.update((c) => ({ ...c, activeProfile: 'p2' }))
    writeFileSync(file, 'cassé', 'utf8')
    const reopened = new JsonStore(file, ConfigSchema)
    reopened.update((c) => ({ ...c, fullscreen: false }))
    const backup = JSON.parse(readFileSync(`${file}.bak`, 'utf8')) as { onboarded: boolean }
    expect(backup.onboarded).toBe(true)
  })

  it('refuse d’enregistrer des données invalides et laisse le fichier intact', () => {
    const libFile = join(dir, 'library.json')
    const store = new JsonStore(libFile, LibrarySchema)
    store.update((l) => ({ ...l, games: [] }))
    const before = readFileSync(libFile, 'utf8')
    expect(() => store.set({ version: 1, games: [{ kind: 'pc' }] } as never)).toThrow()
    expect(readFileSync(libFile, 'utf8')).toBe(before)
    expect(store.get().games).toEqual([])
  })
})
