import { z } from 'zod'
import type { ArtKind, OnlineGame, OnlineImage } from '../../shared/types'

/**
 * Recherche d'images sur SteamGridDB (API v2) avec la clé personnelle de l'utilisateur.
 * La clé vient de `config.json` ; elle n'est jamais écrite dans le code, les journaux ni renvoyée au rendu.
 */
const API = 'https://www.steamgriddb.com/api/v2'
const TIMEOUT_MS = 12_000
const MAX_IMAGES = 24
const MAX_BYTES = 30 * 1024 * 1024
const FILTERS = 'types=static&nsfw=false&humor=false'

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

const GamesSchema = z.array(z.object({ id: z.number(), name: z.string(), release_date: z.number().nullish() }))
const ImagesSchema = z.array(z.object({ url: z.string(), thumb: z.string() }))
const EnvelopeSchema = z.object({ success: z.boolean(), data: z.unknown().optional() })

/** Appelle l'API et renvoie son champ `data` ; les erreurs levées sont des messages pour l'utilisateur. */
async function call(key: string, path: string, fetchFn: Fetch): Promise<unknown> {
  if (!key) throw new Error('Aucune clé SteamGridDB : ajoute la tienne dans Paramètres > Images en ligne.')
  let response: Response
  try {
    response = await fetchFn(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new Error('SteamGridDB ne répond pas : vérifie la connexion Internet.')
  }
  if (response.status === 401 || response.status === 403) throw new Error('SteamGridDB refuse cette clé : vérifie-la dans Paramètres > Images en ligne.')
  if (response.status === 404) return []
  if (!response.ok) throw new Error(`SteamGridDB a répondu par une erreur (${response.status}).`)
  const envelope = EnvelopeSchema.safeParse(await response.json().catch(() => null))
  if (!envelope.success || !envelope.data.success) throw new Error('Réponse de SteamGridDB illisible.')
  return envelope.data.data ?? []
}

/** Jeux dont le nom ressemble à `term`, du plus proche au moins proche. */
export async function searchGames(key: string, term: string, fetchFn: Fetch = fetch): Promise<OnlineGame[]> {
  const games = GamesSchema.safeParse(await call(key, `/search/autocomplete/${encodeURIComponent(term.trim())}`, fetchFn))
  if (!games.success) throw new Error('Réponse de SteamGridDB illisible.')
  return games.data.map((g) => ({ id: g.id, name: g.name, year: g.release_date ? new Date(g.release_date * 1000).getUTCFullYear() : null }))
}

/** Une image n'est téléchargée ou affichée que depuis SteamGridDB, en HTTPS. */
export function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && (parsed.hostname === 'steamgriddb.com' || parsed.hostname.endsWith('.steamgriddb.com'))
  } catch {
    return false
  }
}

async function images(key: string, path: string, fetchFn: Fetch): Promise<OnlineImage[]> {
  const list = ImagesSchema.safeParse(await call(key, path, fetchFn))
  if (!list.success) throw new Error('Réponse de SteamGridDB illisible.')
  return list.data.filter((i) => isAllowedImageUrl(i.url) && isAllowedImageUrl(i.thumb)).slice(0, MAX_IMAGES)
}

/**
 * Images proposées pour un jeu. Pour une jaquette, les images carrées d'abord ; s'il n'y en a aucune,
 * toutes les jaquettes (elles seront recadrées en carré).
 */
export async function listImages(key: string, gameId: number, kind: ArtKind, fetchFn: Fetch = fetch): Promise<OnlineImage[]> {
  if (kind === 'hero') return images(key, `/heroes/game/${gameId}?${FILTERS}`, fetchFn)
  if (kind === 'logo') return images(key, `/logos/game/${gameId}?${FILTERS}`, fetchFn)
  const square = await images(key, `/grids/game/${gameId}?dimensions=1024x1024,512x512&${FILTERS}`, fetchFn)
  return square.length > 0 ? square : images(key, `/grids/game/${gameId}?${FILTERS}`, fetchFn)
}

/** Télécharge une image de SteamGridDB en mémoire. */
export async function downloadImage(url: string, fetchFn: Fetch = fetch): Promise<Buffer> {
  if (!isAllowedImageUrl(url)) throw new Error('Adresse d’image refusée.')
  let response: Response
  try {
    response = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS * 2) })
  } catch {
    throw new Error('Le téléchargement de l’image a échoué.')
  }
  if (!response.ok) throw new Error(`Le téléchargement de l’image a échoué (${response.status}).`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error('Image vide ou trop lourde.')
  return bytes
}
