import { mkdirSync } from 'fs'
import { join } from 'path'
import {
  ConfigSchema,
  LibrarySchema,
  StatsSchema,
  type Config,
  type Library,
  type Stats
} from '../../shared/schemas'
import { JsonStore } from './JsonStore'

export interface Stores {
  config: JsonStore<Config>
  library: JsonStore<Library>
  stats: JsonStore<Stats>
  /** Images converties (jaquettes, fonds). */
  mediaDir: string
  /** Profils d'émulateur ajoutés par l'utilisateur. */
  userEmulatorsDir: string
}

/** Ouvre les fichiers de données du dossier `dataDir` (créé au besoin). */
export function openStores(dataDir: string): Stores {
  const mediaDir = join(dataDir, 'media')
  const userEmulatorsDir = join(dataDir, 'emulators')
  mkdirSync(mediaDir, { recursive: true })
  mkdirSync(userEmulatorsDir, { recursive: true })
  return {
    config: new JsonStore(join(dataDir, 'config.json'), ConfigSchema),
    library: new JsonStore(join(dataDir, 'library.json'), LibrarySchema),
    stats: new JsonStore(join(dataDir, 'stats.json'), StatsSchema),
    mediaDir,
    userEmulatorsDir
  }
}
