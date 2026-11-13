import { closeSync, fstatSync, openSync, readSync } from 'fs'

const SIGNATURE_BYTES = 96
/** Au-delà, on ne lit que la fin : un journal très bavard ne doit pas ralentir le lanceur. */
const MAX_CHUNK = 1024 * 1024

/**
 * Lit ce qu'un programme ajoute à son journal après le lancement.
 * Ce qui était déjà dans le fichier est ignoré. Si le programme repart d'un fichier neuf (les premiers
 * octets changent, ou le fichier rétrécit), la lecture reprend au début.
 * Seules des lignes complètes sont renvoyées : une ligne en cours d'écriture attend la lecture suivante.
 */
export class LogTail {
  private offset = 0
  private signature = ''
  private carry = ''
  /** Vrai dès que le programme a écrit quelque chose depuis le lancement. */
  fresh = false

  constructor(private readonly file: string) {
    this.withFile((fd, size) => {
      this.offset = size
      this.signature = this.readSignature(fd, size)
    })
  }

  private withFile(use: (fd: number, size: number) => void): void {
    let fd: number
    try {
      fd = openSync(this.file, 'r')
    } catch {
      return
    }
    try {
      use(fd, fstatSync(fd).size)
    } catch {
      // Fichier verrouillé ou supprimé entre-temps : on réessaiera à la lecture suivante.
    } finally {
      closeSync(fd)
    }
  }

  private readSignature(fd: number, size: number): string {
    const buffer = Buffer.alloc(Math.min(SIGNATURE_BYTES, size))
    readSync(fd, buffer, 0, buffer.length, 0)
    return buffer.toString('hex')
  }

  /** Lignes complètes ajoutées depuis la dernière lecture (chaîne vide s'il n'y en a pas). */
  read(): string {
    let text = ''
    this.withFile((fd, size) => {
      const signature = this.readSignature(fd, size)
      // Le début n'est comparé que sur la longueur connue : un fichier qui grossit garde le même début.
      const known = this.signature.slice(0, signature.length)
      const restarted = size < this.offset || (this.signature !== '' && !signature.startsWith(known))
      if (restarted) {
        this.offset = 0
        this.carry = ''
      }
      if (signature.length >= this.signature.length || restarted) this.signature = signature
      if (size <= this.offset) return
      const start = Math.max(this.offset, size - MAX_CHUNK)
      const buffer = Buffer.alloc(size - start)
      readSync(fd, buffer, 0, buffer.length, start)
      this.offset = size
      this.fresh = true
      const all = this.carry + buffer.toString('utf8')
      const lastBreak = all.lastIndexOf('\n')
      text = lastBreak >= 0 ? all.slice(0, lastBreak + 1) : ''
      this.carry = lastBreak >= 0 ? all.slice(lastBreak + 1) : all
    })
    return text
  }
}
