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
