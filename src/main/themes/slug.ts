/** Identifiant de dossier tiré d'un nom : « Mon Thème d'été ! » → « mon-theme-d-ete ». */
export function slugify(name: string, fallback = 'theme'): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)
    .replace(/-+$/, '')
  return slug || fallback
}

/** `base`, ou `base-2`, `base-3`… : le premier identifiant que `taken` ne contient pas. */
export function uniqueId(base: string, taken: (id: string) => boolean): string {
  if (!taken(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken(candidate)) return candidate
  }
}
