import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { basename, dirname } from 'path'
import type { z } from 'zod'

/**
 * Fichier JSON validé par un schéma, avec trois garanties :
 * - écriture atomique (fichier temporaire puis renommage) : une coupure ne laisse jamais un fichier à moitié écrit ;
 * - copie de secours `.bak` du dernier état valide avant chaque écriture ;
 * - un fichier illisible ou invalide n'est jamais écrasé en silence : il est copié en `.casse-<date>`,
 *   puis la copie de secours est reprise si elle est valide, sinon les valeurs par défaut.
 */
export class JsonStore<T> {
  private data: T
  /** Ce qui s'est passé à la lecture si le fichier n'était pas utilisable, sinon null. */
  recovery: string | null = null

  constructor(
    private readonly file: string,
    private readonly schema: z.ZodType<T>
  ) {
    this.data = this.load()
  }

  /** Contenu validé, ou null. Le BOM que certains éditeurs ajoutent est toléré. */
  private parse(text: string): T | null {
    try {
      const result = this.schema.safeParse(JSON.parse(text.replace(/^﻿/, '')))
      return result.success ? result.data : null
    } catch {
      return null
    }
  }

  private readValid(file: string): T | null {
    try {
      return existsSync(file) ? this.parse(readFileSync(file, 'utf8')) : null
    } catch {
      return null
    }
  }

  private load(): T {
    if (!existsSync(this.file)) return this.schema.parse({})
    const data = this.readValid(this.file)
    if (data) return data

    const name = basename(this.file)
    try {
      copyFileSync(this.file, `${this.file}.casse-${Date.now()}`)
    } catch {
      // Impossible de garder une copie : on continue quand même.
    }
    const backup = this.readValid(`${this.file}.bak`)
    this.recovery = backup
      ? `${name} était illisible : la copie de secours a été reprise (le fichier abîmé est gardé à côté).`
      : `${name} était illisible : valeurs par défaut (le fichier abîmé est gardé à côté).`
    return backup ?? this.schema.parse({})
  }

  get(): T {
    return this.data
  }

  /** Valide puis enregistre. Lève une erreur si `next` ne respecte pas le schéma (rien n'est alors écrit). */
  set(next: T): T {
    const valid = this.schema.parse(next)
    mkdirSync(dirname(this.file), { recursive: true })
    // Seul un fichier encore valide devient la copie de secours : un fichier abîmé ne l'écrase jamais.
    if (this.readValid(this.file)) copyFileSync(this.file, `${this.file}.bak`)
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(valid, null, 2), 'utf8')
    renameSync(tmp, this.file)
    this.data = valid
    return valid
  }

  update(change: (current: T) => T): T {
    return this.set(change(this.data))
  }
}
