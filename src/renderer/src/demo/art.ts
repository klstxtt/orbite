/**
 * Visuels de démonstration générés (SVG) : formes abstraites, aucune image ni marque de tiers.
 * Le même germe donne toujours la même image.
 */
export type Palette = readonly [string, string, string, string]

function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const toDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

const escapeXml = (s: string): string => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)

function shapes(rand: () => number, w: number, h: number, count: number, colors: Palette): string {
  let out = ''
  for (let i = 0; i < count; i++) {
    const x = rand() * w
    const y = rand() * h
    const size = (0.04 + rand() * 0.16) * h
    const color = colors[1 + Math.floor(rand() * 3)] ?? colors[1]
    const opacity = (0.25 + rand() * 0.55).toFixed(2)
    const kind = Math.floor(rand() * 3)
    if (kind === 0) {
      out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(size / 2).toFixed(0)}" fill="${color}" opacity="${opacity}"/>`
    } else if (kind === 1) {
      const rot = (rand() * 90).toFixed(0)
      out += `<rect x="${(x - size / 2).toFixed(0)}" y="${(y - size / 2).toFixed(0)}" width="${size.toFixed(0)}" height="${size.toFixed(0)}" rx="${(size * 0.18).toFixed(0)}" fill="${color}" opacity="${opacity}" transform="rotate(${rot} ${x.toFixed(0)} ${y.toFixed(0)})"/>`
    } else {
      const p = [0, 1, 2].map((k) => {
        const a = (k * 2 * Math.PI) / 3 + rand() * 6.28
        return `${(x + Math.cos(a) * size * 0.6).toFixed(0)},${(y + Math.sin(a) * size * 0.6).toFixed(0)}`
      })
      out += `<polygon points="${p.join(' ')}" fill="${color}" opacity="${opacity}"/>`
    }
  }
  return out
}

/** Rayons partant d'un point, pour donner du mouvement au fond. */
function rays(rand: () => number, cx: number, cy: number, reach: number, count: number, color: string): string {
  let out = ''
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.2
    const spread = 0.03 + rand() * 0.07
    const p1 = `${(cx + Math.cos(a - spread) * reach).toFixed(0)},${(cy + Math.sin(a - spread) * reach).toFixed(0)}`
    const p2 = `${(cx + Math.cos(a + spread) * reach).toFixed(0)},${(cy + Math.sin(a + spread) * reach).toFixed(0)}`
    out += `<polygon points="${cx},${cy} ${p1} ${p2}" fill="${color}" opacity="${(0.08 + rand() * 0.2).toFixed(2)}"/>`
  }
  return out
}

/** Jaquette carrée avec le titre. */
export function demoCover(title: string, colors: Palette, seed: number): string {
  const rand = prng(seed)
  const size = 600
  const words = title.split(' ')
  const lines = words.length > 2 ? [words.slice(0, 2).join(' '), words.slice(2).join(' ')] : words
  const text = lines
    .map(
      (line, i) =>
        `<text x="300" y="${470 + i * 62 - (lines.length - 1) * 31}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="58" font-weight="800" fill="#fff" stroke="rgba(0,0,0,.35)" stroke-width="3" paint-order="stroke">${escapeXml(line)}</text>`
    )
    .join('')
  return toDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient>` +
      `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></linearGradient></defs>` +
      `<rect width="${size}" height="${size}" fill="url(#g)"/>` +
      rays(rand, 300, 250, 700, 14, colors[3]) +
      shapes(rand, size, size * 0.75, 16, colors) +
      `<circle cx="300" cy="240" r="110" fill="${colors[2]}" opacity=".9"/><circle cx="270" cy="210" r="46" fill="#fff" opacity=".35"/>` +
      `<rect width="${size}" height="${size}" fill="url(#s)"/>${text}</svg>`
  )
}

/** Grande image de fond 16:9, sans texte. */
export function demoHero(colors: Palette, seed: number): string {
  const rand = prng(seed * 7 + 3)
  const w = 1920
  const h = 1080
  const cx = 1150
  const cy = 430
  return toDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
      `<defs><radialGradient id="g" cx=".6" cy=".4" r=".8"><stop offset="0" stop-color="${colors[2]}"/><stop offset=".45" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[0]}"/></radialGradient></defs>` +
      `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
      rays(rand, cx, cy, 1700, 22, colors[3]) +
      shapes(rand, w, h, 46, colors) +
      `<circle cx="${cx}" cy="${cy}" r="230" fill="${colors[3]}" opacity=".85"/><circle cx="${cx - 60}" cy="${cy - 70}" r="90" fill="#fff" opacity=".3"/>` +
      `</svg>`
  )
}
