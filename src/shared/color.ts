/** Couleurs : conversions et choix d'une couleur d'accent à partir des pixels d'une jaquette. */

const HUE_BINS = 12
/** En dessous de ce poids moyen par pixel, l'image est jugée grise : pas d'accent. */
const MIN_COLOR_WEIGHT = 0.003

/** Teinte en degrés (0 à 360), saturation et clarté de 0 à 1. */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return [(h * 60 + 360) % 360, Math.min(1, s), l]
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]
  const part = (v: number): string =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

export function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255)
}

/**
 * Couleur vive dominante d'une image donnée en pixels bruts (`channels` octets par pixel, RVB d'abord).
 * Les pixels sont rangés par teinte et pesés par leur vivacité : un grand fond gris ou noir ne gagne
 * pas contre une zone colorée plus petite. Renvoie `#rrggbb`, assez clair et saturé pour un contour
 * lumineux, ou une chaîne vide si l'image n'a presque pas de couleur.
 */
export function vividAccent(pixels: Uint8Array, channels: number): string {
  const weight = new Float64Array(HUE_BINS)
  const sums = new Float64Array(HUE_BINS * 3)
  const count = Math.floor(pixels.length / channels)
  for (let i = 0; i < count; i++) {
    const r = pixels[i * channels] ?? 0
    const g = pixels[i * channels + 1] ?? 0
    const b = pixels[i * channels + 2] ?? 0
    const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255
    if (chroma < 0.12) continue
    const [h] = rgbToHsl(r, g, b)
    const bin = Math.floor(h / (360 / HUE_BINS)) % HUE_BINS
    const w = chroma * chroma
    weight[bin] = (weight[bin] ?? 0) + w
    sums[bin * 3] = (sums[bin * 3] ?? 0) + r * w
    sums[bin * 3 + 1] = (sums[bin * 3 + 1] ?? 0) + g * w
    sums[bin * 3 + 2] = (sums[bin * 3 + 2] ?? 0) + b * w
  }
  let best = 0
  for (let bin = 1; bin < HUE_BINS; bin++) if ((weight[bin] ?? 0) > (weight[best] ?? 0)) best = bin
  const w = weight[best] ?? 0
  if (count === 0 || w / count < MIN_COLOR_WEIGHT) return ''
  const [h, s] = rgbToHsl((sums[best * 3] ?? 0) / w, (sums[best * 3 + 1] ?? 0) / w, (sums[best * 3 + 2] ?? 0) / w)
  return hslToHex(h, Math.max(0.65, s), 0.58)
}

/** Les trois couleurs du dégradé de sélection, autour d'une couleur d'accent. */
export function accentTriple(hex: string): { a: string; b: string; c: string } {
  const [h, s, l] = hexToHsl(hex)
  return { a: hslToHex(h - 28, s, Math.min(0.72, l + 0.1)), b: hslToHex(h, s, l), c: hslToHex(h + 32, s, l) }
}
