export interface ReadyRules {
  /** Motif attendu dans les nouvelles lignes du journal. */
  log?: RegExp
  /** Motif attendu dans le titre de la fenêtre. */
  title?: RegExp
  /** Motif d'avancement dans le journal : groupe 1 = fait, groupe 2 = total. */
  progress?: RegExp
  /** Pause entre le signal et l'affichage du jeu (ms). */
  settleMs: number
}

export interface ReadyInput {
  /** Nouvelles lignes du journal depuis le dernier appel. */
  log: string
  /** Le programme a écrit dans son journal depuis le lancement. */
  logAvailable: boolean
  /** Titre de la fenêtre principale, ou null si elle n'existe pas encore. */
  title: string | null
  now: number
}

/** Délai avant de se rabattre sur le titre quand le journal attendu n'existe pas. */
export const LOG_FALLBACK_MS = 15_000

/**
 * Décide quand un jeu est « prêt », c'est-à-dire quand l'écran noir peut se retirer.
 * - Journal configuré : on attend son motif, aussi longtemps qu'il faut (compilation de shaders…).
 *   Si le programme n'écrit aucun journal, on se rabat sur le titre au bout de 15 s.
 * - Sinon titre configuré : on attend que le titre corresponde.
 * - Sinon : dès que la fenêtre existe.
 * Dans tous les cas la fenêtre doit exister, et `settleMs` s'écoulent après le signal.
 * Il n'y a volontairement aucun délai maximum.
 */
export class ReadyDetector {
  private signalAt: number | null = null
  /** Ce qui a déclenché le signal (pour le journal du lanceur). */
  reason: string | null = null
  progress: { done: number; total: number } | null = null

  constructor(
    private readonly rules: ReadyRules,
    private readonly startedAt: number
  ) {}

  private signal(reason: string, now: number): void {
    this.signalAt = now
    this.reason = reason
  }

  /** Renvoie vrai quand le jeu est prêt. */
  feed({ log, logAvailable, title, now }: ReadyInput): boolean {
    const { rules } = this
    if (rules.progress && log) {
      const all = [...log.matchAll(new RegExp(rules.progress.source, 'g'))]
      const last = all[all.length - 1]
      const done = Number(last?.[1])
      const total = Number(last?.[2])
      if (last && Number.isFinite(done) && total > 0) this.progress = { done, total }
    }

    if (this.signalAt === null) {
      const titleMatches = title !== null && (rules.title ? rules.title.test(title) : true)
      if (rules.log) {
        if (log && rules.log.test(log)) this.signal('journal', now)
        else if (!logAvailable && now - this.startedAt >= LOG_FALLBACK_MS && titleMatches) {
          this.signal('titre (aucun journal écrit)', now)
        }
      } else if (titleMatches) {
        this.signal(rules.title ? 'titre' : 'fenêtre', now)
      }
    }
    return this.signalAt !== null && title !== null && now - this.signalAt >= rules.settleMs
  }
}
