import { existsSync, readdirSync, readFileSync } from 'fs'
import { basename, dirname, join } from 'path'
import { substituteArgs } from '../../shared/args'
import { EmulatorProfileSchema, type EmulatorProfile } from '../../shared/schemas'

export type ParsedProfile = { ok: true; profile: EmulatorProfile } | { ok: false; error: string }

/** Lit un profil d'émulateur (texte JSON). L'erreur dit quel champ pose problème. */
export function parseProfile(text: string): ParsedProfile {
  let raw: unknown
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return { ok: false, error: 'JSON invalide' }
  }
  const result = EmulatorProfileSchema.safeParse(raw)
  if (result.success) return { ok: true, profile: result.data }
  const issue = result.error.issues[0]
  return { ok: false, error: issue ? `${issue.path.join('.') || 'profil'} : ${issue.message}` : 'profil invalide' }
}

/**
 * Charge tous les `*.json` des dossiers donnés. Un dossier cité plus tard l'emporte sur les précédents
 * pour un même identifiant : un profil de l'utilisateur remplace donc le profil fourni.
 */
export function loadProfiles(dirs: readonly string[]): { profiles: EmulatorProfile[]; errors: string[] } {
  const byId = new Map<string, EmulatorProfile>()
  const errors: string[] = []
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir).sort()) {
      if (!file.toLowerCase().endsWith('.json')) continue
      let parsed: ParsedProfile
      try {
        parsed = parseProfile(readFileSync(join(dir, file), 'utf8'))
      } catch {
        parsed = { ok: false, error: 'lecture impossible' }
      }
      if (parsed.ok) byId.set(parsed.profile.id, parsed.profile)
      else errors.push(`Profil d'émulateur ignoré (${file}) : ${parsed.error}`)
    }
  }
  return { profiles: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)), errors }
}

/** Vrai si le chemin passe par un dossier que le profil interdit (ex. `update-old`). */
export function isIgnoredPath(profile: EmulatorProfile, exePath: string): boolean {
  const ignored = new Set(profile.ignoreDirs.map((d) => d.toLowerCase()))
  return dirname(exePath)
    .split(/[\\/]+/)
    .some((part) => ignored.has(part.toLowerCase()))
}

export function matchesExeName(profile: EmulatorProfile, exePath: string): boolean {
  const name = basename(exePath).toLowerCase()
  return profile.exeNames.some((n) => n.toLowerCase() === name)
}

export interface Command {
  exe: string
  args: string[]
  cwd: string
}

/** Ligne de commande d'un jeu émulé : arguments du profil, puis arguments propres au jeu. */
export function buildCommand(
  profile: EmulatorProfile,
  exePath: string,
  gameFile: string,
  extraArgs: readonly string[] = []
): Command {
  const emuDir = dirname(exePath)
  return {
    exe: exePath,
    args: substituteArgs([...profile.args, ...extraArgs], { game: gameFile, emuDir }),
    cwd: emuDir
  }
}
