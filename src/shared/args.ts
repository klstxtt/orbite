/**
 * Remplace `{nom}` par sa valeur dans chaque argument.
 * Les arguments restent un tableau, passé tel quel au système sans shell : un chemin avec des espaces,
 * des accents ou des guillemets reste un seul argument, sans aucun échappement à faire.
 * Un `{nom}` inconnu est laissé tel quel.
 */
export function substituteArgs(args: readonly string[], vars: Readonly<Record<string, string>>): string[] {
  return args.map((arg) =>
    arg.replace(/\{([a-zA-Z]+)\}/g, (whole, name: string) => (Object.hasOwn(vars, name) ? (vars[name] ?? whole) : whole))
  )
}

/**
 * Découpe une ligne d'arguments tapée par l'utilisateur : les espaces séparent, les guillemets doubles
 * gardent ensemble un argument qui contient des espaces (`--dossier "Mes jeux"`).
 */
export function splitArgs(line: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  let started = false
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted
      started = true
    } else if (/\s/.test(char) && !quoted) {
      if (started) out.push(current)
      current = ''
      started = false
    } else {
      current += char
      started = true
    }
  }
  if (started) out.push(current)
  return out
}

/** Inverse de `splitArgs`, pour afficher et modifier des arguments enregistrés. */
export function joinArgs(args: readonly string[]): string {
  return args.map((arg) => (arg === '' || /\s/.test(arg) ? `"${arg}"` : arg)).join(' ')
}
