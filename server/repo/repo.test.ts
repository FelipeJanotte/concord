// Repo sobre o banco de verdade (PGlite em memória, ou Postgres com DATABASE_URL_TEST).
import { randomUUID } from 'node:crypto'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Message, User } from '../../src/shared/types'
import { db } from '../db/client'
import { messages, sessions } from '../db/schema'
import { DEFAULT_CHANNELS, ensureInitialData, importLegacyJson } from '../db/seed'
import { openTestDatabase } from '../tests/database'
import {
  avatarUrl,
  findAccount,
  findAccountByEmail,
  findAccountByGoogleId,
  insertAccount,
  isTagTaken,
  updateAccount
} from './accounts'
import { channelNameExists, countChannels, deleteChannel, findChannel, insertChannel, listChannels } from './channels'
import { insertMessage, listMessages } from './messages'
import { deleteSession, findValidSession, insertSession } from './sessions'
import type { Account } from './types'
import { DuplicateError } from './util'

let cleanup: () => Promise<void>

beforeAll(async () => {
  cleanup = await openTestDatabase()
})

afterAll(async () => {
  await cleanup?.()
})

let n = 0
function newAccount(over: Partial<Account> = {}): Account {
  n++
  return {
    id: randomUUID(),
    email: `pessoa${n}-${randomUUID().slice(0, 6)}@teste.com`,
    name: `Pessoa ${n}`,
    tag: `t${randomUUID().slice(0, 4)}`,
    tagLocked: true,
    color: '#5865f2',
    passwordHash: 'scrypt$a$b',
    googleId: null,
    avatarType: null,
    avatarVersion: 0,
    createdAt: Date.now(),
    ...over
  }
}

async function newTextChannel(name = `canal-${randomUUID().slice(0, 8)}`) {
  const channel = { id: randomUUID(), name, type: 'text' as const, createdAt: Date.now() }
  await insertChannel(channel)
  return channel
}

function authorOf(a: Account, socketId = 'socket-1'): User {
  return { id: socketId, accountId: a.id, name: a.name, tag: a.tag, color: a.color, avatarUrl: null }
}

function msg(channelId: string, author: User, content: string, createdAt = Date.now()): Message {
  return { id: randomUUID(), channelId, author, content, createdAt }
}

describe('contas', () => {
  it('insere e encontra por id, e-mail e Google id', async () => {
    const a = await insertAccount(newAccount({ googleId: `g-${randomUUID()}` }))
    expect(await findAccount(a.id)).toEqual(a)
    expect(await findAccountByEmail(a.email)).toEqual(a)
    expect(await findAccountByGoogleId(a.googleId!)).toEqual(a)
    expect(typeof a.createdAt).toBe('number')
  })

  it('id que não é uuid ou não existe devolve undefined (sem erro do banco)', async () => {
    expect(await findAccount('nao-e-uuid')).toBeUndefined()
    expect(await findAccount(randomUUID())).toBeUndefined()
    expect(await updateAccount('nao-e-uuid', { name: 'x' })).toBeUndefined()
  })

  it('o banco recusa e-mail, id (sem diferenciar maiúsculas) e Google id repetidos', async () => {
    const a = await insertAccount(newAccount({ googleId: `g-${randomUUID()}` }))
    await expect(insertAccount(newAccount({ email: a.email }))).rejects.toEqual(new DuplicateError('email'))
    await expect(insertAccount(newAccount({ tag: a.tag.toUpperCase() }))).rejects.toEqual(new DuplicateError('tag'))
    await expect(insertAccount(newAccount({ googleId: a.googleId }))).rejects.toEqual(new DuplicateError('googleId'))
  })

  it('várias contas só com Google id nulo convivem', async () => {
    await insertAccount(newAccount())
    await expect(insertAccount(newAccount())).resolves.toBeTruthy()
  })

  it('isTagTaken ignora maiúsculas e pode excluir a própria conta', async () => {
    const a = await insertAccount(newAccount({ tag: 'AbC12' }))
    expect(await isTagTaken('abc12')).toBe(true)
    expect(await isTagTaken('ABC12', a.id)).toBe(false)
    expect(await isTagTaken('zz999')).toBe(false)
  })

  it('updateAccount aplica só o patch e recusa id repetido', async () => {
    const a = await insertAccount(newAccount())
    const b = await insertAccount(newAccount())
    const updated = await updateAccount(a.id, { name: 'Novo', avatarType: 'image/png', avatarVersion: 1 })
    expect(updated).toEqual({ ...a, name: 'Novo', avatarType: 'image/png', avatarVersion: 1 })
    await expect(updateAccount(a.id, { tag: b.tag })).rejects.toEqual(new DuplicateError('tag'))
  })

  it('avatarUrl inclui a versão (para não usar a foto velha do cache)', () => {
    expect(avatarUrl({ id: 'x', avatarType: null, avatarVersion: 3 })).toBeNull()
    expect(avatarUrl({ id: 'x', avatarType: 'image/png', avatarVersion: 3 })).toBe('/avatars/x?v=3')
  })
})

describe('sessões', () => {
  it('encontra sessão válida e apaga', async () => {
    const a = await insertAccount(newAccount())
    await insertSession({ tokenHash: 'h-valida', accountId: a.id, expiresAt: Date.now() + 60_000 })
    expect(await findValidSession('h-valida')).toMatchObject({ accountId: a.id })
    await deleteSession('h-valida')
    expect(await findValidSession('h-valida')).toBeUndefined()
  })

  it('sessão expirada não vale e é apagada na próxima gravação', async () => {
    const a = await insertAccount(newAccount())
    await insertSession({ tokenHash: 'h-velha', accountId: a.id, expiresAt: Date.now() - 1000 })
    expect(await findValidSession('h-velha')).toBeUndefined()
    await insertSession({ tokenHash: 'h-nova', accountId: a.id, expiresAt: Date.now() + 60_000 })
    expect(await db().select().from(sessions).where(eq(sessions.tokenHash, 'h-velha'))).toHaveLength(0)
  })
})

describe('canais', () => {
  it('insere, encontra (com e sem tipo) e lista em ordem de criação', async () => {
    const t0 = Date.now()
    const a = { id: randomUUID(), name: 'ordem-a', type: 'text' as const, createdAt: t0 + 10_000 }
    const b = { id: randomUUID(), name: 'ordem-b', type: 'voice' as const, createdAt: t0 + 20_000 }
    await insertChannel(b)
    await insertChannel(a)
    expect(await findChannel(a.id)).toEqual(a)
    expect(await findChannel(a.id, 'text')).toEqual(a)
    expect(await findChannel(a.id, 'voice')).toBeUndefined()
    expect(await findChannel('x')).toBeUndefined()
    const ids = (await listChannels()).map((c) => c.id)
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id))
  })

  it('nome repetido no mesmo tipo é recusado; em tipo diferente pode', async () => {
    const name = `Rep-${randomUUID().slice(0, 6)}`
    await insertChannel({ id: randomUUID(), name, type: 'text', createdAt: Date.now() })
    expect(await channelNameExists('text', name.toLowerCase())).toBe(true)
    expect(await channelNameExists('voice', name)).toBe(false)
    await expect(
      insertChannel({ id: randomUUID(), name: name.toUpperCase(), type: 'text', createdAt: Date.now() })
    ).rejects.toEqual(new DuplicateError('name'))
    await expect(insertChannel({ id: randomUUID(), name, type: 'voice', createdAt: Date.now() })).resolves.toBeUndefined()
  })

  it('o banco recusa tipo inválido e nome vazio ou longo', async () => {
    const base = { id: randomUUID(), createdAt: Date.now() }
    await expect(insertChannel({ ...base, name: 'x', type: 'dm' as never })).rejects.toThrow()
    await expect(insertChannel({ ...base, id: randomUUID(), name: '', type: 'text' })).rejects.toThrow()
    await expect(insertChannel({ ...base, id: randomUUID(), name: 'x'.repeat(33), type: 'text' })).rejects.toThrow()
  })

  it('contar e apagar (apagar leva as mensagens junto)', async () => {
    const before = await countChannels()
    const a = await insertAccount(newAccount())
    const ch = await newTextChannel()
    await insertMessage(msg(ch.id, authorOf(a), 'some junto'))
    expect(await countChannels()).toBe(before + 1)
    expect(await deleteChannel(ch.id)).toBe(true)
    expect(await deleteChannel(ch.id)).toBe(false)
    expect(await deleteChannel('nao-e-uuid')).toBe(false)
    expect(await countChannels()).toBe(before)
    expect(await db().select().from(messages).where(eq(messages.channelId, ch.id))).toHaveLength(0)
  })
})

describe('mensagens', () => {
  it('histórico junta o autor com a conta (nome e foto atuais)', async () => {
    const a = await insertAccount(newAccount({ name: 'Antes' }))
    const ch = await newTextChannel()
    const m = msg(ch.id, authorOf(a, 'socket-xyz'), 'oi')
    await insertMessage(m)
    await updateAccount(a.id, { name: 'Depois', avatarType: 'image/png', avatarVersion: 2 })
    const page = await listMessages(ch.id)
    expect(page).toEqual({
      hasMore: false,
      messages: [
        {
          id: m.id,
          channelId: ch.id,
          content: 'oi',
          createdAt: m.createdAt,
          author: { id: a.id, accountId: a.id, name: 'Depois', tag: a.tag, color: a.color, avatarUrl: `/avatars/${a.id}?v=2` }
        }
      ]
    })
  })

  it('sem conta (autor antigo), usa a cópia do autor', async () => {
    const ch = await newTextChannel()
    const m = msg(ch.id, { id: 'sock', accountId: 'sock', name: 'Visitante', tag: '', color: '#123456', avatarUrl: null }, 'antigo')
    await insertMessage(m)
    const [got] = (await listMessages(ch.id)).messages
    expect(got.author).toEqual({ id: `removido-${m.id}`, accountId: '', name: 'Visitante', tag: '', color: '#123456', avatarUrl: null })
  })

  it('pagina do mais novo para o mais antigo, mantendo a ordem de chegada', async () => {
    const a = await insertAccount(newAccount())
    const ch = await newTextChannel()
    const sameMs = Date.now()
    // mesmo milissegundo de propósito: a ordem vem do `seq`, não do horário
    for (let i = 1; i <= 120; i++) await insertMessage(msg(ch.id, authorOf(a), `m${i}`, sameMs))

    const p1 = await listMessages(ch.id)
    expect(p1.hasMore).toBe(true)
    expect(p1.messages.map((m) => m.content)).toEqual(Array.from({ length: 50 }, (_, i) => `m${i + 71}`))

    const p2 = await listMessages(ch.id, { before: p1.messages[0].id })
    expect(p2.hasMore).toBe(true)
    expect(p2.messages.map((m) => m.content)).toEqual(Array.from({ length: 50 }, (_, i) => `m${i + 21}`))

    const p3 = await listMessages(ch.id, { before: p2.messages[0].id })
    expect(p3.hasMore).toBe(false)
    expect(p3.messages.map((m) => m.content)).toEqual(Array.from({ length: 20 }, (_, i) => `m${i + 1}`))
  })

  it('limit é respeitado e limitado a 1..100', async () => {
    const a = await insertAccount(newAccount())
    const ch = await newTextChannel()
    for (let i = 0; i < 5; i++) await insertMessage(msg(ch.id, authorOf(a), `x${i}`))
    expect((await listMessages(ch.id, { limit: 2 })).messages).toHaveLength(2)
    expect((await listMessages(ch.id, { limit: 0 })).messages).toHaveLength(5)
    expect((await listMessages(ch.id, { limit: -3 })).messages).toHaveLength(1)
  })

  it('cursor inválido, de outro canal ou canal inexistente devolve vazio', async () => {
    const a = await insertAccount(newAccount())
    const ch1 = await newTextChannel()
    const ch2 = await newTextChannel()
    const m = msg(ch2.id, authorOf(a), 'do outro canal')
    await insertMessage(m)
    const empty = { messages: [], hasMore: false }
    expect(await listMessages(ch1.id, { before: 'nao-e-uuid' })).toEqual(empty)
    expect(await listMessages(ch1.id, { before: m.id })).toEqual(empty)
    expect(await listMessages('nao-e-uuid')).toEqual(empty)
    expect(await listMessages(randomUUID())).toEqual(empty)
  })

  it('o banco recusa mensagem vazia ou com mais de 2000 caracteres', async () => {
    const a = await insertAccount(newAccount())
    const ch = await newTextChannel()
    await expect(insertMessage(msg(ch.id, authorOf(a), ''))).rejects.toThrow()
    await expect(insertMessage(msg(ch.id, authorOf(a), 'x'.repeat(2001)))).rejects.toThrow()
    await expect(insertMessage(msg(ch.id, authorOf(a), 'x'.repeat(2000)))).resolves.toBeUndefined()
  })
})

describe('dados iniciais e importação do db.json antigo', () => {
  it('ensureInitialData não mexe num banco que já tem dados', async () => {
    expect(await ensureInitialData(join(tmpdir(), 'nao-existe.json'))).toBeNull()
  })

  it('importa contas, sessões válidas, canais e mensagens (formato antigo incluído) e é idempotente', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'concord-import-'))
    try {
      const acc = newAccount({ email: 'IMPORTADA@Teste.com', tag: 'imp01' })
      const textId = randomUUID()
      const voiceId = randomUUID()
      const file = join(dir, 'db.json')
      writeFileSync(
        file,
        JSON.stringify({
          accounts: [{ ...acc, tagLocked: undefined }],
          sessions: [
            { tokenHash: 'imp-valida', accountId: acc.id, expiresAt: Date.now() + 60_000 },
            { tokenHash: 'imp-velha', accountId: acc.id, expiresAt: Date.now() - 1 },
            { tokenHash: 'imp-orfa', accountId: randomUUID(), expiresAt: Date.now() + 60_000 }
          ],
          channels: [
            { id: textId, name: 'importado', type: 'text', createdAt: 1 },
            { id: voiceId, name: 'Voz Importada', type: 'voice', createdAt: 2 },
            { id: 'nao-uuid', name: 'ruim', type: 'text' }
          ],
          messages: {
            [textId]: [
              // de antes das contas: sem accountId/tag
              { id: randomUUID(), channelId: textId, content: 'primeira', createdAt: 10, author: { id: 'sock-antigo', name: 'Velho', color: '#111111' } },
              { id: randomUUID(), channelId: textId, content: '  segunda  ', createdAt: 20, author: { id: 'sock', accountId: acc.id, name: 'X', tag: 'imp01', color: '#222222' } },
              { id: randomUUID(), channelId: textId, content: '   ', createdAt: 30, author: { id: 's', name: 'Vazio' } }
            ],
            [voiceId]: [{ id: randomUUID(), content: 'não entra', author: { id: 's', name: 'X' } }]
          }
        })
      )

      const r = await importLegacyJson(file)
      expect(r).toEqual({ accounts: 1, sessions: 1, channels: 2, messages: 2 })
      expect(await findAccount(acc.id)).toMatchObject({ email: 'importada@teste.com', tagLocked: true })
      expect(await findValidSession('imp-valida')).toBeTruthy()
      expect(await findValidSession('imp-velha')).toBeUndefined()
      const page = await listMessages(textId)
      expect(page.messages.map((m) => [m.content, m.author.name, m.author.accountId])).toEqual([
        ['primeira', 'Velho', ''],
        ['segunda', acc.name, acc.id]
      ])

      // rodar de novo não duplica nada
      expect(await importLegacyJson(file)).toEqual({ accounts: 0, sessions: 0, channels: 0, messages: 0 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('canais padrão existem como constante para o banco vazio', () => {
    expect(DEFAULT_CHANNELS.map((c) => c.name)).toEqual(['geral', 'off-topic', 'Sala de Voz', 'Jogos'])
  })
})
