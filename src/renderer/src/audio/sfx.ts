/**
 * Sons d'interface synthétisés avec la Web Audio API : aucun fichier audio.
 * Chaque son est une ou deux notes très courtes avec une enveloppe douce.
 */
interface Note {
  freq: number
  /** Fréquence d'arrivée (glissando) ; absente : note tenue. */
  to?: number
  /** Durée en secondes. */
  dur: number
  /** Décalage de départ en secondes. */
  at?: number
  type?: OscillatorType
  gain?: number
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
let volume = 0.7
let muted = false

function output(): { ctx: AudioContext; master: GainNode } | null {
  try {
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'interactive' })
      master = ctx.createGain()
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return master ? { ctx, master } : null
  } catch {
    return null
  }
}

function play(notes: readonly Note[]): void {
  if (muted || volume <= 0) return
  const out = output()
  if (!out) return
  out.master.gain.value = volume
  for (const n of notes) {
    const t0 = out.ctx.currentTime + (n.at ?? 0)
    const osc = out.ctx.createOscillator()
    const env = out.ctx.createGain()
    osc.type = n.type ?? 'sine'
    osc.frequency.setValueAtTime(n.freq, t0)
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.dur)
    const peak = n.gain ?? 0.18
    env.gain.setValueAtTime(0.0001, t0)
    env.gain.exponentialRampToValueAtTime(peak, t0 + 0.008)
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur)
    osc.connect(env).connect(out.master)
    osc.start(t0)
    osc.stop(t0 + n.dur + 0.02)
  }
}

export const sfx = {
  /** Déplacement du curseur. */
  move: (): void => play([{ freq: 880, to: 1320, dur: 0.05, type: 'triangle', gain: 0.1 }]),
  /** Validation : deux notes montantes. */
  confirm: (): void =>
    play([
      { freq: 660, dur: 0.07, type: 'triangle', gain: 0.16 },
      { freq: 990, dur: 0.12, at: 0.06, type: 'triangle', gain: 0.16 }
    ]),
  /** Retour : une note descendante. */
  back: (): void => play([{ freq: 520, to: 330, dur: 0.11, type: 'triangle', gain: 0.14 }]),
  /** Bord de liste : on ne peut pas aller plus loin. */
  edge: (): void => play([{ freq: 180, to: 140, dur: 0.07, type: 'square', gain: 0.05 }])
}

/** `percent` de 0 à 100. */
export function setSfxVolume(percent: number, mute = false): void {
  volume = Math.max(0, Math.min(100, percent)) / 100
  muted = mute
}
