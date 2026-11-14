/**
 * Onde ficam os bytes dos anexos. Hoje em disco (`DATA_DIR/uploads/<id>`).
 * Para usar S3/R2/MinIO depois, implemente `FileStorage` e troque `storage`;
 * o resto do servidor só usa esta interface.
 */
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { UPLOAD_DIR } from '../config'
import { isUuid } from '../repo/util'

export interface FileStorage {
  /** Grava tudo o que vier de `data`. Se `data` falhar, nada fica salvo. */
  save(id: string, data: Readable): Promise<void>
  /** Stream do arquivo, ou null se não existir. */
  open(id: string): Promise<{ stream: Readable; size: number } | null>
  remove(id: string): Promise<void>
  /** Todos os ids guardados (para achar arquivos sem registro no banco). */
  list(): Promise<string[]>
}

export function diskStorage(dir: string): FileStorage {
  const path = (id: string): string => {
    if (!isUuid(id)) throw new Error(`id de arquivo inválido: ${id}`)
    return join(dir, id)
  }

  return {
    async save(id, data) {
      await mkdir(dir, { recursive: true })
      const final = path(id)
      const partial = `${final}.part`
      try {
        await pipeline(data, createWriteStream(partial, { flags: 'wx' }))
        await rename(partial, final)
      } catch (err) {
        await rm(partial, { force: true })
        throw err
      }
    },

    async open(id) {
      if (!isUuid(id)) return null
      try {
        const info = await stat(path(id))
        return { stream: createReadStream(path(id)), size: info.size }
      } catch {
        return null
      }
    },

    async remove(id) {
      if (!isUuid(id)) return
      await rm(path(id), { force: true })
    },

    async list() {
      try {
        return (await readdir(dir)).filter((name) => isUuid(name))
      } catch {
        return []
      }
    }
  }
}

export const storage: FileStorage = diskStorage(UPLOAD_DIR)
