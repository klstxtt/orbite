import type { GameView } from '../../../shared/types'
import { demoCover, demoHero, type Palette } from './art'

/** Jeux de démonstration (rendu dans un navigateur) : titres inventés, visuels générés. */
const DEMO: ReadonlyArray<{ title: string; colors: Palette }> = [
  { title: 'Astral Drift', colors: ['#1b1140', '#5b2bd6', '#ff8a3d', '#ffd166'] },
  { title: 'Néon Rally', colors: ['#06283d', '#1363df', '#47b5ff', '#dff6ff'] },
  { title: 'Forêt d’Émeraude', colors: ['#0b2b1c', '#1f7a4d', '#8fd694', '#f2e86d'] },
  { title: 'Bulle Express', colors: ['#3a0f3d', '#d6336c', '#ff8fab', '#ffe5ec'] },
  { title: 'Pixel Verger', colors: ['#2b2d0f', '#7a9e1f', '#f6c453', '#fff3b0'] },
  { title: 'Cités de Brume', colors: ['#101820', '#3c5a73', '#9fb8c8', '#f2aa4c'] }
]

export const demoGames: GameView[] = DEMO.map((g, i) => ({
  id: `demo-${i + 1}`,
  title: g.title,
  kind: 'pc',
  cover: demoCover(g.title, g.colors, i + 1),
  hero: demoHero(g.colors, i + 1),
  accent: g.colors[1],
  available: true,
  lastPlayed: 0,
  playtime: 0
}))
