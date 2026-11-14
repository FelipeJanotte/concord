import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { text } from 'node:stream/consumers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { diskStorage, type FileStorage } from './index'

let dir: string
let storage: FileStorage

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'concord-storage-'))
  storage = diskStorage(join(dir, 'uploads'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('diskStorage', () => {
  it('grava, abre, lista e apaga', async () => {
    const id = randomUUID()
    await storage.save(id, Readable.from([Buffer.from('olá '), Buffer.from('mundo')]))
    const file = await storage.open(id)
    expect(file?.size).toBe(Buffer.byteLength('olá mundo'))
    expect(await text(file!.stream)).toBe('olá mundo')
    expect(await storage.list()).toEqual([id])
    await storage.remove(id)
    expect(await storage.open(id)).toBeNull()
    expect(await storage.list()).toEqual([])
  })

  it('se a origem falhar no meio, nada fica salvo (nem o .part)', async () => {
    const id = randomUUID()
    const failing = new Readable({
      read() {
        this.push(Buffer.from('começo'))
        this.destroy(new Error('caiu'))
      }
    })
    await expect(storage.save(id, failing)).rejects.toThrow('caiu')
    expect(await storage.open(id)).toBeNull()
    expect(readdirSync(join(dir, 'uploads'))).toEqual([])
  })

  it('recusa id que não é uuid (nada de "../" virando caminho)', async () => {
    await expect(storage.save('../fora', Readable.from(['x']))).rejects.toThrow('id de arquivo inválido')
    expect(await storage.open('../fora')).toBeNull()
    await storage.remove('../fora') // não faz nada
    expect(existsSync(join(dir, 'fora'))).toBe(false)
  })

  it('list ignora arquivos que não são de anexo e pasta inexistente', async () => {
    expect(await diskStorage(join(dir, 'nao-existe')).list()).toEqual([])
    const id = randomUUID()
    await storage.save(id, Readable.from(['x']))
    await diskStorage(join(dir, 'uploads')).save(randomUUID(), Readable.from(['y']))
    expect((await storage.list()).length).toBe(2)
  })
})
