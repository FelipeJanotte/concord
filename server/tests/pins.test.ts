import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, PINS_PER_CHANNEL_MAX, type DmEntry, type Message, type Permission } from '../../src/shared/types'
import { expectNoEvent, TestServer, waitFor, type TestUser } from './helpers'

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

const channel = () => server.createChannel(`fixar-${Math.random().toString(36).slice(2, 7)}`)

async function send(u: TestUser, channelId: string, content: string): Promise<Message> {
  const got = waitFor(u.socket, 'message:new', (m) => m.content === content)
  u.socket.emit('message:send', { channelId, content })
  return (await got)[0]
}

async function giveRole(u: TestUser, permissions: Permission[]): Promise<void> {
  const owner = await server.asOwner()
  const res = await owner.socket.emitWithAck('role:create', { name: `cargo-${u.tag}`, color: null, permissions })
  if (!res.ok) throw new Error(res.error)
  const set = await owner.socket.emitWithAck('member:set-roles', { accountId: u.self.accountId, roleIds: [res.role.id] })
  if (!set.ok) throw new Error(set.error)
}

async function friendsDm(a: TestUser, b: TestUser): Promise<DmEntry> {
  expect((await a.socket.emitWithAck('friend:request', `${b.name}#${b.tag}`)).ok).toBe(true)
  expect((await b.socket.emitWithAck('friend:accept', a.account.id)).ok).toBe(true)
  const res = await a.socket.emitWithAck('dm:open', b.account.id)
  if (!res.ok) throw new Error(res.error)
  return res.dm
}

const refuse = (error: string) => ({ ok: false, error })

describe('fixar mensagens (B27)', () => {
  it('quem tem manageMessages fixa: todos recebem message:pinned e o aviso "fixou", e a lista mostra', async () => {
    const mod = await user('Moderadora')
    await giveRole(mod, ['manageMessages'])
    const ana = await user('Ana')
    const ch = await channel()
    const msg = await send(ana, ch.id, 'importante')
    const pinned = waitFor(ana.socket, 'message:pinned', (p) => p.messageId === msg.id)
    const notice = waitFor(ana.socket, 'message:new', (m) => m.kind === 'pin')
    expect(await mod.socket.emitWithAck('message:pin', { messageId: msg.id, on: true })).toEqual({ ok: true })
    const [event] = await pinned
    expect(event).toMatchObject({ channelId: ch.id, messageId: msg.id })
    expect(event.pinnedAt).toEqual(expect.any(Number))
    expect((await notice)[0]).toMatchObject({
      channelId: ch.id,
      kind: 'pin',
      content: '',
      author: { accountId: mod.self.accountId },
      replyTo: { id: msg.id, content: 'importante' }
    })
    const pins = await ana.socket.emitWithAck('message:pins', { channelId: ch.id })
    expect(pins.map((m) => m.id)).toEqual([msg.id])
    expect(pins[0].pinnedAt).toBe(event.pinnedAt)
    const history = await ana.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(history.messages.find((m) => m.id === msg.id)?.pinnedAt).toBe(event.pinnedAt)
  })

  it('desafixar: sai da lista, avisa message:pinned com null e não posta aviso', async () => {
    const owner = await server.asOwner()
    const ch = await channel()
    const msg = await send(owner, ch.id, 'temporária')
    expect(await owner.socket.emitWithAck('message:pin', { messageId: msg.id, on: true })).toEqual({ ok: true })
    const unpinned = waitFor(owner.socket, 'message:pinned', (p) => p.messageId === msg.id && p.pinnedAt === null)
    const noNotice = expectNoEvent(owner.socket, 'message:new')
    expect(await owner.socket.emitWithAck('message:pin', { messageId: msg.id, on: false })).toEqual({ ok: true })
    await unpinned
    await noNotice
    expect(await owner.socket.emitWithAck('message:pins', { channelId: ch.id })).toEqual([])
  })

  it('lista com a fixada mais recente primeiro', async () => {
    const owner = await server.asOwner()
    const ch = await channel()
    const a = await send(owner, ch.id, 'a')
    const b = await send(owner, ch.id, 'b')
    await owner.socket.emitWithAck('message:pin', { messageId: b.id, on: true })
    await owner.socket.emitWithAck('message:pin', { messageId: a.id, on: true })
    expect((await owner.socket.emitWithAck('message:pins', { channelId: ch.id })).map((m) => m.id)).toEqual([a.id, b.id])
  })

  it('sem manageMessages não fixa, nem a própria mensagem', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const msg = await send(ana, ch.id, 'minha')
    expect(await ana.socket.emitWithAck('message:pin', { messageId: msg.id, on: true })).toEqual(refuse('Você não tem permissão para fixar mensagens'))
  })

  it('canal que a pessoa não vê: mensagem não encontrada, lista vazia e o aviso não vaza', async () => {
    const owner = await server.asOwner()
    const mod = await user('Moderadora')
    await giveRole(mod, ['manageMessages'])
    const ch = await channel()
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: ch.id,
      overrides: [{ roleId: EVERYONE_ROLE_ID, allow: [], deny: ['view'] }]
    })
    const msg = await send(owner, ch.id, 'segredo')
    expect(await mod.socket.emitWithAck('message:pin', { messageId: msg.id, on: true })).toEqual(refuse('Mensagem não encontrada'))
    const silent = expectNoEvent(mod.socket, 'message:pinned')
    expect(await owner.socket.emitWithAck('message:pin', { messageId: msg.id, on: true })).toEqual({ ok: true })
    await silent
    expect(await mod.socket.emitWithAck('message:pins', { channelId: ch.id })).toEqual([])
  })

  it('em conversa privada qualquer um dos dois fixa; a dona não vê', async () => {
    const owner = await server.asOwner()
    const a = await user('Ana')
    const b = await user('Bia')
    const dm = await friendsDm(a, b)
    const msg = await send(a, dm.channel.id, 'nossa')
    expect(await b.socket.emitWithAck('message:pin', { messageId: msg.id, on: true })).toEqual({ ok: true })
    expect((await a.socket.emitWithAck('message:pins', { channelId: dm.channel.id })).map((m) => m.id)).toEqual([msg.id])
    expect(await owner.socket.emitWithAck('message:pin', { messageId: msg.id, on: false })).toEqual(refuse('Mensagem não encontrada'))
    expect(await owner.socket.emitWithAck('message:pins', { channelId: dm.channel.id })).toEqual([])
  })

  it(`até ${PINS_PER_CHANNEL_MAX} por canal; fixar de novo a mesma não conta nem avisa`, async () => {
    const owner = await server.asOwner()
    const ch = await channel()
    const sent: Message[] = []
    for (let i = 0; i <= PINS_PER_CHANNEL_MAX; i++) sent.push(await send(owner, ch.id, `p${i}`))
    for (const m of sent.slice(0, PINS_PER_CHANNEL_MAX)) {
      expect(await owner.socket.emitWithAck('message:pin', { messageId: m.id, on: true })).toEqual({ ok: true })
    }
    expect(await owner.socket.emitWithAck('message:pin', { messageId: sent.at(-1)!.id, on: true })).toEqual(
      refuse(`Este canal já tem ${PINS_PER_CHANNEL_MAX} mensagens fixadas`)
    )
    const silent = expectNoEvent(owner.socket, 'message:pinned')
    expect(await owner.socket.emitWithAck('message:pin', { messageId: sent[0].id, on: true })).toEqual({ ok: true })
    await silent
  })

  it('recusas: pedido inválido, inexistente e o próprio aviso de fixar', async () => {
    const owner = await server.asOwner()
    const ch = await channel()
    const msg = await send(owner, ch.id, 'alvo')
    expect(await owner.socket.emitWithAck('message:pin', null as never)).toEqual(refuse('Pedido inválido'))
    expect(await owner.socket.emitWithAck('message:pin', { messageId: msg.id, on: 'sim' as never })).toEqual(refuse('Pedido inválido'))
    expect(await owner.socket.emitWithAck('message:pin', { messageId: 'lixo', on: true })).toEqual(refuse('Mensagem não encontrada'))
    const notice = waitFor(owner.socket, 'message:new', (m) => m.kind === 'pin')
    await owner.socket.emitWithAck('message:pin', { messageId: msg.id, on: true })
    const [pinNotice] = await notice
    expect(await owner.socket.emitWithAck('message:pin', { messageId: pinNotice.id, on: true })).toEqual(refuse('Essa mensagem não pode ser fixada'))
  })

  it('apagar a mensagem fixada tira da lista', async () => {
    const owner = await server.asOwner()
    const ch = await channel()
    const msg = await send(owner, ch.id, 'some')
    await owner.socket.emitWithAck('message:pin', { messageId: msg.id, on: true })
    expect(await owner.socket.emitWithAck('message:delete', { messageId: msg.id })).toEqual({ ok: true })
    expect(await owner.socket.emitWithAck('message:pins', { channelId: ch.id })).toEqual([])
  })
})
