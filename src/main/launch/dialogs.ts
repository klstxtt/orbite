import { spawn, type ChildProcess } from 'child_process'
import type { EmulatorProfile } from '../../shared/schemas'

/**
 * Démarre le script qui répond aux boîtes de dialogue connues d'un émulateur (accessibilité Windows).
 * Il ne tourne que pendant le chargement d'un jeu dont le profil déclare des dialogues, et s'arrête
 * seul quand le processus surveillé se ferme. Chaque réponse donnée est rapportée à `onLog`.
 */
export function startDialogWatcher(
  script: string,
  pid: number,
  rules: EmulatorProfile['dialogs'],
  onLog: (line: string) => void
): ChildProcess | null {
  if (rules.length === 0) return null
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
    {
      env: { ...process.env, CL_DIALOG_PID: String(pid), CL_DIALOG_RULES: JSON.stringify(rules) },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }
  )
  child.once('error', () => undefined)
  let pending = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    pending += chunk.toString('utf8')
    let nl: number
    while ((nl = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, nl).trim()
      pending = pending.slice(nl + 1)
      if (line) onLog(`dialogue : ${line}`)
    }
  })
  return child
}
