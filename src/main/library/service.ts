import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { dirname } from 'path'
import type { EmulatorProfile, Game } from '../../shared/schemas'
import { buildCommand, type Command } from '../emulators/profiles'
import type { Stores } from '../store/stores'
import { titleFromPath } from './importer'

const samePath = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/** Le fichier qui identifie un jeu : son programme (jeu PC) ou son fichier de jeu (émulateur). */
export const gamePath = (game: Game): string => (game.kind === 'pc' ? game.exe : game.gameFile)

/** Opérations sur la bibliothèque. Les erreurs levées sont des messages destinés à l'utilisateur. */
export class LibraryService {
  constructor(
    private readonly stores: Stores,
    private readonly profiles: () => readonly EmulatorProfile[]
  ) {}

  games(): Game[] {
    return this.stores.library.get().games
  }

  find(id: string): Game {
    const game = this.games().find((g) => g.id === id)
    if (!game) throw new Error('Jeu introuvable dans la bibliothèque.')
    return game
  }

  has(path: string): boolean {
    return this.games().some((g) => samePath(gamePath(g), path))
  }

  private add(game: Game): Game {
    if (this.has(gamePath(game))) throw new Error(`« ${game.title} » est déjà dans la bibliothèque.`)
    this.stores.library.update((lib) => ({ ...lib, games: [...lib.games, game] }))
    return game
  }

  addPc(exe: string, title = titleFromPath(exe)): Game {
    return this.add({
      id: randomUUID(),
      kind: 'pc',
      title,
      exe,
      args: [],
      cwd: '',
      art: { cover: '', hero: '' },
      addedAt: Date.now()
    })
  }

  addEmulated(emulatorId: string, gameFile: string, title = titleFromPath(gameFile)): Game {
    this.profile(emulatorId)
    return this.add({
      id: randomUUID(),
      kind: 'emulated',
      title,
      emulatorId,
      gameFile,
      extraArgs: [],
      art: { cover: '', hero: '' },
      addedAt: Date.now()
    })
  }

  rename(id: string, title: string): void {
    this.find(id)
    this.stores.library.update((lib) => ({ ...lib, games: lib.games.map((g) => (g.id === id ? { ...g, title } : g)) }))
  }

  /** Retire le jeu et renvoie ses fichiers d'images, à supprimer par l'appelant. */
  remove(id: string): string[] {
    const game = this.find(id)
    this.stores.library.update((lib) => ({ ...lib, games: lib.games.filter((g) => g.id !== id) }))
    return [game.art.cover, game.art.hero].filter(Boolean)
  }

  /** Change une image ; renvoie l'ancien fichier (ou une chaîne vide). */
  setArt(id: string, slot: 'cover' | 'hero', file: string): string {
    const previous = this.find(id).art[slot]
    this.stores.library.update((lib) => ({
      ...lib,
      games: lib.games.map((g) => (g.id === id ? { ...g, art: { ...g.art, [slot]: file } } : g))
    }))
    return previous
  }

  profile(emulatorId: string): EmulatorProfile {
    const profile = this.profiles().find((p) => p.id === emulatorId)
    if (!profile) throw new Error(`Aucun profil d'émulateur « ${emulatorId} ».`)
    return profile
  }

  /** Chemin de l'exécutable d'un émulateur sur cette machine, ou une chaîne vide. */
  emulatorExe(emulatorId: string): string {
    return this.stores.config.get().emulators[emulatorId]?.exePath ?? ''
  }

  /** Vrai si tout ce qu'il faut pour lancer le jeu est présent sur le disque. */
  isAvailable(game: Game): boolean {
    if (game.kind === 'pc') return existsSync(game.exe)
    const exe = this.emulatorExe(game.emulatorId)
    return exe !== '' && existsSync(exe) && existsSync(game.gameFile)
  }

  /** Ligne de commande du jeu ; lève une erreur lisible si quelque chose manque. */
  command(game: Game): Command {
    if (game.kind === 'pc') {
      if (!existsSync(game.exe)) throw new Error(`Programme introuvable : ${game.exe}`)
      return { exe: game.exe, args: game.args, cwd: game.cwd || dirname(game.exe) }
    }
    const profile = this.profile(game.emulatorId)
    const exe = this.emulatorExe(game.emulatorId)
    if (!exe || !existsSync(exe)) throw new Error(`Émulateur ${profile.name} introuvable : localise-le dans « Ajouter un jeu ».`)
    if (!existsSync(game.gameFile)) throw new Error(`Fichier du jeu introuvable : ${game.gameFile}`)
    return buildCommand(profile, exe, game.gameFile, game.extraArgs)
  }
}
