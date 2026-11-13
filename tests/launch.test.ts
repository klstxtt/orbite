import { appendFileSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pickMainWindow } from '../src/main/launch/launcher'
import { LogTail } from '../src/main/launch/logTail'
import { LOG_FALLBACK_MS, ReadyDetector } from '../src/main/launch/ready'
import { trackProcessTree } from '../src/main/launch/tree'

describe('trackProcessTree', () => {
  it('suit les descendants, sur plusieurs niveaux', () => {
    const known = new Set([100])
    const alive = trackProcessTree(known, [
      { pid: 100, ppid: 1 },
      { pid: 200, ppid: 100 },
      { pid: 300, ppid: 200 },
      { pid: 999, ppid: 1 }
    ])
    expect([...alive].sort()).toEqual([100, 200, 300])
    expect(known.has(999)).toBe(false)
  })

  it('garde le vrai jeu quand le programme lancé n’était qu’un relais déjà fermé', () => {
    const known = new Set([100])
    // Le relais (100) a disparu ; son enfant le cite encore comme parent.
    const alive = trackProcessTree(known, [{ pid: 200, ppid: 100 }])
    expect([...alive]).toEqual([200])
    // Plus tard, l'enfant se ferme aussi : plus rien ne tourne.
    expect(trackProcessTree(known, [{ pid: 999, ppid: 1 }]).size).toBe(0)
  })
})

describe('pickMainWindow', () => {
  const win = (hwnd: number, width: number, height: number, owned = false) => ({ hwnd, pid: 1, title: '', owned, width, height })

  it('prend la plus grande fenêtre qui n’est ni un dialogue ni une miniature', () => {
    expect(pickMainWindow([win(1, 300, 200), win(2, 1920, 1080), win(3, 4000, 3000, true), win(4, 100, 50)])?.hwnd).toBe(2)
    expect(pickMainWindow([win(3, 4000, 3000, true), win(4, 100, 50)])).toBeNull()
  })
})

describe('ReadyDetector', () => {
  const base = { log: '', logAvailable: true, title: 'Émulateur', now: 0 }

  it('attend le motif du journal aussi longtemps qu’il faut, puis le délai de stabilisation', () => {
    const d = new ReadyDetector({ log: /shaders prêts/, title: /\|/, settleMs: 2000 }, 0)
    // Le titre correspond déjà et une demi-heure passe : toujours pas prêt.
    expect(d.feed({ ...base, title: 'Emu | Jeu', now: 30 * 60_000 })).toBe(false)
    expect(d.feed({ ...base, log: 'ligne\nshaders prêts\n', now: 31 * 60_000 })).toBe(false)
    expect(d.feed({ ...base, now: 31 * 60_000 + 1999 })).toBe(false)
    expect(d.feed({ ...base, now: 31 * 60_000 + 2000 })).toBe(true)
    expect(d.reason).toBe('journal')
  })

  it('se rabat sur le titre si l’émulateur n’écrit aucun journal', () => {
    const d = new ReadyDetector({ log: /prêt/, title: /\|.*\|/, settleMs: 0 }, 0)
    const input = { ...base, logAvailable: false, title: 'Emu | Jeu | GPU' }
    expect(d.feed({ ...input, now: LOG_FALLBACK_MS - 1 })).toBe(false)
    expect(d.feed({ ...input, title: 'Emu', now: LOG_FALLBACK_MS + 1 })).toBe(false)
    expect(d.feed({ ...input, now: LOG_FALLBACK_MS + 2 })).toBe(true)
    expect(d.reason).toContain('titre')
  })

  it('sans journal configuré : le titre décide', () => {
    const d = new ReadyDetector({ title: /^Jeu$/, settleMs: 0 }, 0)
    expect(d.feed({ ...base, title: 'Chargement' })).toBe(false)
    expect(d.feed({ ...base, title: 'Jeu' })).toBe(true)
  })

  it('sans aucune règle (jeu PC) : prêt quand la fenêtre existe', () => {
    const d = new ReadyDetector({ settleMs: 500 }, 0)
    expect(d.feed({ ...base, title: null, now: 10_000 })).toBe(false)
    expect(d.feed({ ...base, title: '', now: 10_100 })).toBe(false)
    expect(d.feed({ ...base, title: '', now: 10_600 })).toBe(true)
    expect(d.reason).toBe('fenêtre')
  })

  it('n’est jamais prêt sans fenêtre, même après le signal', () => {
    const d = new ReadyDetector({ log: /ok/, settleMs: 0 }, 0)
    expect(d.feed({ ...base, log: 'ok\n', title: null })).toBe(false)
    expect(d.feed({ ...base, title: 'Jeu', now: 5 })).toBe(true)
  })

  it('lit l’avancement le plus récent', () => {
    const d = new ReadyDetector({ log: /fini/, progress: /pipelines: (\d+) of (\d+) done/, settleMs: 0 }, 0)
    d.feed({ ...base, log: 'pipelines: 5000 of 120461 done\npipelines: 10000 of 120461 done\n' })
    expect(d.progress).toEqual({ done: 10000, total: 120461 })
    d.feed({ ...base, log: 'autre ligne\n' })
    expect(d.progress).toEqual({ done: 10000, total: 120461 })
  })
})

describe('LogTail', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cl-log-'))
    file = join(dir, 'emu.txt')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('ignore ce qui était déjà dans le journal et ne rend que des lignes complètes', () => {
    writeFileSync(file, '[0.1] ancienne session\nBooting game\n')
    const tail = new LogTail(file)
    expect(tail.read()).toBe('')
    expect(tail.fresh).toBe(false)
    appendFileSync(file, 'nouvelle ligne\ndébut de li')
    expect(tail.read()).toBe('nouvelle ligne\n')
    expect(tail.fresh).toBe(true)
    appendFileSync(file, 'gne\n')
    expect(tail.read()).toBe('début de ligne\n')
    expect(tail.read()).toBe('')
  })

  it('reprend au début quand l’émulateur repart d’un fichier neuf, même plus gros que l’ancien', () => {
    writeFileSync(file, '[0.002720] vieux\n')
    const tail = new LogTail(file)
    renameSync(file, `${file}.old.txt`)
    writeFileSync(file, '[0.003111] neuf, première ligne\n[0.5] et une ligne bien plus longue que tout l’ancien fichier\n')
    expect(tail.read()).toBe('[0.003111] neuf, première ligne\n[0.5] et une ligne bien plus longue que tout l’ancien fichier\n')
  })

  it('accepte un journal qui n’existe pas encore au lancement', () => {
    const tail = new LogTail(file)
    expect(tail.read()).toBe('')
    writeFileSync(file, 'première\n')
    expect(tail.read()).toBe('première\n')
  })

  it('reprend au début si le fichier est vidé puis réécrit', () => {
    writeFileSync(file, 'a'.repeat(500) + '\n')
    const tail = new LogTail(file)
    writeFileSync(file, 'court\n')
    expect(tail.read()).toBe('court\n')
  })
})
