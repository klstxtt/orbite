import type { ProcessInfo } from '../native/win32'

/**
 * Suit l'arbre de processus d'un jeu. `known` contient le processus lancé et tous ses descendants
 * déjà vus (même terminés) ; il est complété avec les nouveaux descendants trouvés dans `processes`.
 * Renvoie ceux qui tournent encore.
 *
 * Un programme qui n'est qu'un relais (il lance le vrai jeu puis se ferme) reste ainsi suivi :
 * son enfant garde l'identifiant du relais comme parent, même une fois le relais terminé.
 */
export function trackProcessTree(known: Set<number>, processes: readonly ProcessInfo[]): Set<number> {
  let grew = true
  while (grew) {
    grew = false
    for (const p of processes) {
      if (p.pid !== 0 && known.has(p.ppid) && !known.has(p.pid)) {
        known.add(p.pid)
        grew = true
      }
    }
  }
  const alive = new Set<number>()
  for (const p of processes) if (known.has(p.pid)) alive.add(p.pid)
  return alive
}
