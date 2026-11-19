import { randomBytes } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, SEARCH_PAGE_SIZE, type DmEntry, type Message, type SearchRequest, type SearchResult } from '../../src/shared/types'
import { TestServer, waitFor, type TestUser } from './helpers'

let server: TestServer
const open: TestUser[] = []

beforeAll(async () => {
  server = await TestServer.start()
})
afterEach(() => {
  for (const u of open.splice(0)) u.socket.close()
})
afterAll(async () => {
  await server?.destroy()
})

async function user(name: string): Promise<TestUser> {
  const u = await server.newUser(name)
  open.push(u)
  return u
}

const word = (): string => `w${randomBytes(4).toString('hex')}`
const channel = () => server.createChannel(`busca-${Math.random().toString(36).slice(2, 7)}`)

async function send(u: TestUser, channelId: string, content: string): Promise<Message> {
  const got = waitFor(u.socket, 'message:new', (m) => m.content === content)
  u.socket.emit('message:send', { channelId, content })
  return (await got)[0]
}

async function search(u: TestUser, req: SearchRequest): Promise<Extract<SearchResult, { ok: true }>> {
  const res = await u.socket.emitWithAck('message:search', req)
  if (!res.ok) throw new Error(res.error)
  return res
}

async function friends(a: TestUser, b: TestUser): Promise<void> {
  expect((await a.socket.emitWithAck('friend:request', `${b.name}#${b.tag}`)).ok).toBe(true)
  expect((await b.socket.emitWithAck('friend:accept', a.account.id)).ok).toBe(true)
}

async function openDm(a: TestUser, b: TestUser): Promise<DmEntry> {
  const res = await a.socket.emitWithAck('dm:open', b.account.id)
  if (!res.ok) throw new Error(res.error)
  return res.dm
}

describe('buscar mensagens (B26)', () => {
  it('acha pelo trecho sem diferenciar maiúsculas, mais novas primeiro, com autor e canal', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const w = word()
    const first = await send(ana, ch.id, `primeira ${w} aqui`)
    await send(ana, ch.id, 'nada a ver')
    const second = await send(ana, ch.id, `segunda ${w.toUpperCase()}`)
    const res = await search(ana, { query: w })
    expect(res.messages.map((m) => m.id)).toEqual([second.id, first.id])
    expect(res.messages[0]).toMatchObject({ channelId: ch.id, author: { accountId: ana.self.accountId, name: 'Ana' } })
    expect(res.hasMore).toBe(false)
  })

  it('não devolve mensagem de canal privado que a conta não vê', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const secret = await channel()
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: secret.id,
      overrides: [{ roleId: EVERYONE_ROLE_ID, allow: [], deny: ['view'] }]
    })
    const w = word()
    await send(owner, secret.id, `segredo ${w}`)
    expect((await search(ana, { query: w })).messages).toEqual([])
    expect((await search(ana, { query: w, channelId: secret.id })).messages).toEqual([])
    expect((await search(owner, { query: w })).messages).toHaveLength(1)
  })

  it('não devolve conversa privada alheia, nem para a dona; os dois membros acham', async () => {
    const owner = await server.asOwner()
    const a = await user('Ana')
    const b = await user('Bia')
    await friends(a, b)
    const dm = await openDm(a, b)
    const w = word()
    await send(a, dm.channel.id, `cochicho ${w}`)
    expect((await search(owner, { query: w })).messages).toEqual([])
    expect((await search(owner, { query: w, channelId: dm.channel.id })).messages).toEqual([])
    expect((await search(a, { query: w })).messages).toHaveLength(1)
    expect((await search(b, { query: w, channelId: dm.channel.id })).messages).toHaveLength(1)
  })

  it('filtra por canal e por autor', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await channel()
    const other = await channel()
    const w = word()
    const inCh = await send(ana, ch.id, `${w} um`)
    const byBia = await send(bia, other.id, `${w} dois`)
    await send(ana, other.id, `${w} três`)
    expect((await search(ana, { query: w, channelId: ch.id })).messages.map((m) => m.id)).toEqual([inCh.id])
    expect((await search(ana, { query: w, authorId: bia.self.accountId })).messages.map((m) => m.id)).toEqual([byBia.id])
    expect((await search(ana, { query: '', authorId: bia.self.accountId, channelId: other.id })).messages.map((m) => m.id)).toEqual([byBia.id])
  })

  it('% e _ são procurados como texto, não como curinga', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const w = word()
    const percent = await send(ana, ch.id, `${w} 100% certo`)
    await send(ana, ch.id, `${w} 100 certo`)
    const under = await send(ana, ch.id, `${w} a_b`)
    await send(ana, ch.id, `${w} axb`)
    expect((await search(ana, { query: `${w} 100%`, channelId: ch.id })).messages.map((m) => m.id)).toEqual([percent.id])
    expect((await search(ana, { query: 'a_b', channelId: ch.id })).messages.map((m) => m.id)).toEqual([under.id])
  })

  it(`pagina de ${SEARCH_PAGE_SIZE} em ${SEARCH_PAGE_SIZE} com before`, async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const w = word()
    const sent: Message[] = []
    for (let i = 0; i < SEARCH_PAGE_SIZE + 2; i++) sent.push(await send(ana, ch.id, `${w} ${i}`))
    const first = await search(ana, { query: w })
    expect(first.messages).toHaveLength(SEARCH_PAGE_SIZE)
    expect(first.hasMore).toBe(true)
    expect(first.messages[0].id).toBe(sent.at(-1)!.id)
    const second = await search(ana, { query: w, before: first.messages.at(-1)!.id })
    expect(second.messages.map((m) => m.id)).toEqual([sent[1].id, sent[0].id])
    expect(second.hasMore).toBe(false)
  })

  it('recusas: busca vazia sem autor, longa demais e pedido inválido', async () => {
    const ana = await user('Ana')
    expect(await ana.socket.emitWithAck('message:search', { query: '   ' })).toEqual({ ok: false, error: 'Digite o que buscar' })
    expect(await ana.socket.emitWithAck('message:search', { query: 'x'.repeat(101) })).toEqual({
      ok: false,
      error: 'A busca pode ter no máximo 100 caracteres'
    })
    expect(await ana.socket.emitWithAck('message:search', null as never)).toEqual({ ok: false, error: 'Pedido inválido' })
    expect(await search(ana, { query: 'x', channelId: 'lixo', authorId: 'lixo', before: 'lixo' })).toEqual({ ok: true, messages: [], hasMore: false })
  })
})

describe('histórico em volta de uma mensagem (B26)', () => {
  it('around traz metade antes e metade depois, com hasMore e hasNewer; after continua para frente', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const sent: Message[] = []
    for (let i = 0; i < 60; i++) sent.push(await send(ana, ch.id, `m${i}`))
    const around = await ana.socket.emitWithAck('message:history', { channelId: ch.id, around: sent[30].id })
    expect(around.messages.map((m) => m.content)).toEqual(sent.slice(5, 55).map((m) => m.content))
    expect(around).toMatchObject({ hasMore: true, hasNewer: true })
    const after = await ana.socket.emitWithAck('message:history', { channelId: ch.id, after: around.messages.at(-1)!.id })
    expect(after.messages.map((m) => m.content)).toEqual(sent.slice(55).map((m) => m.content))
    expect(after.hasNewer).toBe(false)
    const edge = await ana.socket.emitWithAck('message:history', { channelId: ch.id, around: sent[58].id })
    expect(edge.messages.at(-1)!.id).toBe(sent[59].id)
    expect(edge.hasNewer).toBe(false)
  })

  it('around de mensagem de outro canal ou que não existe: página vazia', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const other = await channel()
    const elsewhere = await send(ana, other.id, 'longe')
    expect(await ana.socket.emitWithAck('message:history', { channelId: ch.id, around: elsewhere.id })).toEqual({ messages: [], hasMore: false })
    expect(await ana.socket.emitWithAck('message:history', { channelId: ch.id, around: 'lixo' })).toEqual({ messages: [], hasMore: false })
  })
})
