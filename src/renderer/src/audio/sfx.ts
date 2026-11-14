/**
 * Sons d'interface synthétisés avec la Web Audio API : aucun fichier audio.
 * Chaque son est une ou deux notes très courtes avec une enveloppe douce.
 * Un thème choisit un jeu de sons : « doux », « rétro » ou « muet ».
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

type SoundName = 'move' | 'confirm' | 'back' | 'edge'
export type SfxPreset = 'doux' | 'retro' | 'muet'

const PRESETS: Record<Exclude<SfxPreset, 'muet'>, Record<SoundName, readonly Note[]>> = {
  doux: {
    move: [{ freq: 880, to: 1320, dur: 0.05, type: 'triangle', gain: 0.1 }],
    confirm: [
      { freq: 660, dur: 0.07, type: 'triangle', gain: 0.16 },
      { freq: 990, dur: 0.12, at: 0.06, type: 'triangle', gain: 0.16 }
    ],
    back: [{ freq: 520, to: 330, dur: 0.11, type: 'triangle', gain: 0.14 }],
    edge: [{ freq: 180, to: 140, dur: 0.07, type: 'square', gain: 0.05 }]
  },
  // Ondes carrées et notes franches, façon console 8 bits.
  retro: {
    move: [{ freq: 1047, dur: 0.035, type: 'square', gain: 0.05 }],
    confirm: [
      { freq: 784, dur: 0.06, type: 'square', gain: 0.07 },
      { freq: 1047, dur: 0.06, at: 0.06, type: 'square', gain: 0.07 },
      { freq: 1568, dur: 0.1, at: 0.12, type: 'square', gain: 0.07 }
    ],
    back: [
      { freq: 659, dur: 0.05, type: 'square', gain: 0.06 },
      { freq: 440, dur: 0.09, at: 0.05, type: 'square', gain: 0.06 }
    ],
    edge: [{ freq: 110, dur: 0.08, type: 'sawtooth', gain: 0.06 }]
  }
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
let volume = 0.7
let muted = false
let preset: SfxPreset = 'doux'

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

function play(name: SoundName): void {
  if (muted || volume <= 0 || preset === 'muet') return
  const out = output()
  if (!out) return
  out.master.gain.value = volume
  for (const n of PRESETS[preset][name]) {
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

/** Bruit blanc très court passé dans un filtre : le « clac » d'une pièce qui s'enclenche. */
function click(out: { ctx: AudioContext; master: GainNode }, at: number, freq: number, gain: number): void {
  const { ctx: c } = out
  const length = Math.floor(c.sampleRate * 0.03)
  const buffer = c.createBuffer(1, length, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2
  const noise = c.createBufferSource()
  noise.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = 1.4
  const env = c.createGain()
  env.gain.value = gain
  noise.connect(filter).connect(env).connect(out.master)
  noise.start(at)

  // Petit corps tonal sous le bruit, pour que le clic ne sonne pas « papier ».
  const osc = c.createOscillator()
  const body = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq * 0.7, at)
  osc.frequency.exponentialRampToValueAtTime(freq * 0.3, at + 0.045)
  body.gain.setValueAtTime(gain * 0.5, at)
  body.gain.exponentialRampToValueAtTime(0.0001, at + 0.05)
  osc.connect(body).connect(out.master)
  osc.start(at)
  osc.stop(at + 0.07)
}

/** Lancement d'un jeu : un clic, puis trois notes qui montent vite et une dernière qui résonne. */
function launch(): void {
  if (muted || volume <= 0 || preset === 'muet') return
  const out = output()
  if (!out) return
  out.master.gain.value = volume
  const t0 = out.ctx.currentTime + 0.01
  click(out, t0, 3000, 0.45)
  const type: OscillatorType = preset === 'retro' ? 'square' : 'triangle'
  const level = preset === 'retro' ? 0.05 : 0.13
  const notes = [
    { freq: 659, at: 0.05, dur: 0.09 },
    { freq: 988, at: 0.12, dur: 0.09 },
    { freq: 1319, at: 0.19, dur: 0.6 }
  ]
  for (const n of notes) {
    const start = t0 + n.at
    const osc = out.ctx.createOscillator()
    const env = out.ctx.createGain()
    osc.type = type
    osc.frequency.value = n.freq
    env.gain.setValueAtTime(0.0001, start)
    env.gain.exponentialRampToValueAtTime(level, start + 0.01)
    env.gain.exponentialRampToValueAtTime(0.0001, start + n.dur)
    osc.connect(env).connect(out.master)
    osc.start(start)
    osc.stop(start + n.dur + 0.03)
  }
}

export const sfx = {
  /** Lancement d'un jeu. */
  launch,
  /** Déplacement du curseur. */
  move: (): void => play('move'),
  /** Validation. */
  confirm: (): void => play('confirm'),
  /** Retour. */
  back: (): void => play('back'),
  /** Bord de liste : on ne peut pas aller plus loin. */
  edge: (): void => play('edge')
}

/** `percent` de 0 à 100. */
export function setSfxVolume(percent: number, mute = false): void {
  volume = Math.max(0, Math.min(100, percent)) / 100
  muted = mute
}

export function setSfxPreset(next: SfxPreset): void {
  preset = next
}
