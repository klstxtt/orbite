import { cpSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

/** Ce qui appartient au lanceur dans son dossier de données (le reste est le cache de Chromium). */
const OWN = /^(config|library|stats)\.json(\..+)?$|^(media|emulators|themes|launcher\.log)$/

/**
 * Le lanceur a changé de nom, donc de dossier de données : au premier démarrage sous le nouveau
 * nom, la bibliothèque, les images, les thèmes et les réglages de l'ancien dossier sont copiés.
 * L'ancien dossier reste en place (sauvegarde). Ne fait rien si le nouveau dossier a déjà sa config.
 * Renvoie le nombre d'éléments copiés.
 */
export function migrateDataDir(oldDir: string, newDir: string): number {
  if (oldDir === newDir || !existsSync(join(oldDir, 'config.json')) || existsSync(join(newDir, 'config.json'))) return 0
  let copied = 0
  for (const name of readdirSync(oldDir)) {
    if (!OWN.test(name)) continue
    cpSync(join(oldDir, name), join(newDir, name), { recursive: true, force: false, errorOnExist: false })
    copied++
  }
  return copied
}
