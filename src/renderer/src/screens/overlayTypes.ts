import type { ScanRequest } from '../../../shared/schemas'
import type { ImportCandidate } from '../../../shared/types'

/** Ce qui est affiché par-dessus l'accueil. */
export type Overlay =
  // Bibliothèque
  | { type: 'welcome' }
  | { type: 'add' }
  /** Choix de l'émulateur, avant d'ajouter un fichier ou d'importer un dossier. */
  | { type: 'emulator'; then: 'file' | 'folder' }
  | { type: 'import'; request: ScanRequest; dir: string; candidates: ImportCandidate[]; checked: ReadonlySet<string> }
  | { type: 'options'; gameId: string }
  | { type: 'remove'; gameId: string }
  // Paramètres
  | { type: 'settings' }
  | { type: 'sound' }
  | { type: 'display' }
  | { type: 'system' }
  | { type: 'emulators' }
  | { type: 'power' }
  | { type: 'profiles' }
  | { type: 'profile'; id: string }
  | { type: 'profile-color'; id: string }
  | { type: 'profile-delete'; id: string }
  | { type: 'themes' }
  | { type: 'theme'; id: string }
  | { type: 'theme-accent'; id: string }
  | { type: 'theme-delete'; id: string }
  /** Saisie d'un texte au clavier virtuel ; `back` est l'écran où revenir. */
  | { type: 'text'; title: string; initial: string; max: number; back: Overlay | null; submit: (text: string) => void }

export interface HostProps<T extends Overlay = Overlay> {
  overlay: T
  open: (overlay: Overlay | null) => void
  notify: (text: string) => void
}
