// Repo de efeitos sonoros sobre o banco de verdade (PGlite em memória ou Postgres com DATABASE_URL_TEST).
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openTestDatabase } from '../tests/database'
import { insertAccount } from './accounts'
import { countSounds, deleteSound, findSound, insertSound, listSounds, type NewSound } from './sounds'
import { DuplicateError } from './util'

let cleanup: () => Promise<void>
let uploaderId: string

beforeAll(async () => {
  cleanup = await openTestDatabase()
  uploaderId = (
    await insertAccount({
      id: randomUUID(),
      email: `sons-${randomUUID().slice(0, 6)}@teste.com`,
      name: 'Sons',
      tag: `s${randomUUID().slice(0, 4)}`,
      tagLocked: true,
      color: '#5865f2',
      passwordHash: null,
      googleId: null,
      avatarType: null,
      avatarVersion: 0,
      createdAt: Date.now()
    })
  ).id
})

afterAll(async () => {
  await cleanup?.()
})

const newSound = (over: Partial<NewSound> = {}): NewSound => ({
  id: randomUUID(),
  name: `som-${randomUUID().slice(0, 6)}`,
  emoji: null,
  uploaderId,
  contentType: 'audio/wav',
  size: 1000,
  durationMs: 1500,
  ...over
})

describe('sons', () => {
  it('insere, encontra, lista e conta (url sem assinatura no repo)', async () => {
    const s = await insertSound(newSound({ emoji: '🎺' }))
    expect(s.sound).toMatchObject({ emoji: '🎺', durationMs: 1500, uploaderId, url: `/sounds/${s.sound.id}` })
    expect(s.contentType).toBe('audio/wav')
    expect(await findSound(s.sound.id)).toEqual(s)
    expect((await listSounds()).some((x) => x.sound.id === s.sound.id)).toBe(true)
    expect(await countSounds(uploaderId)).toBeGreaterThanOrEqual(1)
    expect(await countSounds()).toBeGreaterThanOrEqual(1)
  })

  it('id inválido ou inexistente: undefined/false', async () => {
    expect(await findSound('lixo')).toBeUndefined()
    expect(await findSound(randomUUID())).toBeUndefined()
    expect(await deleteSound('lixo')).toBe(false)
  })

  it('nome repetido sem diferenciar maiúsculas vira DuplicateError', async () => {
    await insertSound(newSound({ name: 'Trombeta' }))
    await expect(insertSound(newSound({ name: 'TROMBETA' }))).rejects.toEqual(new DuplicateError('name'))
  })

  it('apaga', async () => {
    const s = await insertSound(newSound())
    expect(await deleteSound(s.sound.id)).toBe(true)
    expect(await findSound(s.sound.id)).toBeUndefined()
  })

  it('o banco recusa duração acima de 5 s, mais de 512 KB, tipo desconhecido e emoji longo', async () => {
    await expect(insertSound(newSound({ durationMs: 5001 }))).rejects.toThrow()
    await expect(insertSound(newSound({ size: 512 * 1024 + 1 }))).rejects.toThrow()
    await expect(insertSound(newSound({ contentType: 'audio/flac' as never }))).rejects.toThrow()
    await expect(insertSound(newSound({ emoji: '123456789' }))).rejects.toThrow()
  })
})
