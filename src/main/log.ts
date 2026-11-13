import { appendFileSync, renameSync, statSync } from 'fs'

const MAX_BYTES = 1024 * 1024

/** Journal du lanceur (`launcher.log`) : une ligne horodatée par événement, un seul fichier de secours. */
export function createLog(file: string): (line: string) => void {
  return (line) => {
    try {
      try {
        if (statSync(file).size > MAX_BYTES) renameSync(file, `${file}.old`)
      } catch {
        // Pas encore de fichier.
      }
      appendFileSync(file, `${new Date().toISOString()} ${line}\n`, 'utf8')
    } catch {
      // Le journal ne doit jamais faire échouer le lanceur.
    }
  }
}
