import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { ChannelReadState, Message } from '../../src/shared/types'
import { expectNoEvent, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

let server: TestServer
const open: ClientSocket[] = []

beforeAll(async () => {
  server = await TestServer.start()
})
afterEach(() => {
  for (const s of open.splice(0)) s.close()
})
afterAll(async () => {
  await server?.destroy()
})

async function user(name: string): Promise<TestUser> {
  const u = await server.newUser(name)
  open.push(u.socket)
  return u
}

async function secondWindow(u: TestUser): Promise<ClientSocket> {
  const socket = await server.connect(u.token)
  open.push(socket)
  await socket.emitWithAck('hello')
  return socket
}

const channel = () => server.createChannel(`lidos-${Math.random().toString(36).slice(2, 7)}`)

async function send(socket: ClientSocket, channelId: string, content: string): Promise<Message> {
  const got = waitFor(socket, 'message:new', (m) => m.content === content)
  socket.emit('message:send', { channelId, content })
  return (await got)[0]
}

async function stateOf(socket: ClientSocket, channelId: string): Promise<ChannelReadState | undefined> {
  const reads = await socket.emitWithAck('channel:reads')
  return reads.find((r) => r.channelId === channelId)
}

const read = (socket: ClientSocket, channelId: string, messageId: string) => socket.emitWithAck('channel:read', { channelId, messageId })

describe('channel:reads', () => {
  it('canal nunca lido com mensagem de outra pessoa é não lido; só com mensagens minhas, não', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await channel()
    expect(await stateOf(ana.socket, ch.id)).toEqual({ channelId: ch.id, lastReadId: null, unread: false })
    await send(ana.socket, ch.id, 'oi')
    expect(await stateOf(ana.socket, ch.id)).toEqual({ channelId: ch.id, lastReadId: null, unread: false })
    expect(await stateOf(bia.socket, ch.id)).toEqual({ channelId: ch.id, lastReadId: null, unread: true })
  })

  it('ler apaga o não lido e fica guardado; mensagem nova de outra pessoa volta a ser não lido', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await channel()
    const first = await send(ana.socket, ch.id, 'primeira')
    expect(await read(bia.socket, ch.id, first.id)).toEqual({ ok: true })

    const later = await secondWindow(bia)
    expect(await stateOf(later, ch.id)).toEqual({ channelId: ch.id, lastReadId: first.id, unread: false })

    await send(ana.socket, ch.id, 'segunda')
    expect(await stateOf(later, ch.id)).toEqual({ channelId: ch.id, lastReadId: first.id, unread: true })
  })

  it('só avança: ler uma mensagem mais antiga não volta o ponto de leitura', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await channel()
    const old = await send(ana.socket, ch.id, 'antiga')
    const recent = await send(ana.socket, ch.id, 'recente')
    expect(await read(bia.socket, ch.id, recent.id)).toEqual({ ok: true })
    expect(await read(bia.socket, ch.id, old.id)).toEqual({ ok: true })
    expect(await stateOf(bia.socket, ch.id)).toEqual({ channelId: ch.id, lastReadId: recent.id, unread: false })
  })

  it('não lista canal que a pessoa não vê e lista as conversas privadas dela', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const bia = await user('Bia')
    const secret = await channel()
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: secret.id,
      overrides: [{ roleId: '00000000-0000-0000-0000-000000000000', allow: [], deny: ['view'] }]
    })
    expect((await ana.socket.emitWithAck('friend:request', `${bia.name}#${bia.tag}`)).ok).toBe(true)
    expect((await bia.socket.emitWithAck('friend:accept', ana.account.id)).ok).toBe(true)
    const dm = await ana.socket.emitWithAck('dm:open', bia.account.id)
    if (!dm.ok) throw new Error(dm.error)
    await send(ana.socket, dm.dm.channel.id, 'só nós')

    expect(await stateOf(ana.socket, secret.id)).toBeUndefined()
    expect(await stateOf(bia.socket, dm.dm.channel.id)).toEqual({ channelId: dm.dm.channel.id, lastReadId: null, unread: true })
    expect(await stateOf(owner.socket, dm.dm.channel.id)).toBeUndefined()
  })
})

describe('channel:read', () => {
  it('avisa as outras janelas da mesma conta (channel:read-sync), não a que leu nem outras contas', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await channel()
    const msg = await send(ana.socket, ch.id, 'lê aí')
    const other = await secondWindow(bia)

    const synced = waitFor(other, 'channel:read-sync')
    const notToReader = expectNoEvent(bia.socket, 'channel:read-sync')
    const notToOthers = expectNoEvent(ana.socket, 'channel:read-sync')
    expect(await read(bia.socket, ch.id, msg.id)).toEqual({ ok: true })
    expect((await synced)[0]).toEqual({ channelId: ch.id, messageId: msg.id })
    await notToReader
    await notToOthers
  })

  it('ler de novo o mesmo ponto não avisa as outras janelas', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await channel()
    const msg = await send(ana.socket, ch.id, 'de novo')
    const other = await secondWindow(bia)
    const firstSync = waitFor(other, 'channel:read-sync')
    await read(bia.socket, ch.id, msg.id)
    await firstSync
    const silent = expectNoEvent(other, 'channel:read-sync')
    expect(await read(bia.socket, ch.id, msg.id)).toEqual({ ok: true })
    await silent
  })

  it('recusas: ids inválidos, mensagem de outro canal e canal que não vê (sem vazar)', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const ch = await channel()
    const elsewhere = await channel()
    const msg = await send(owner.socket, elsewhere.id, 'em outro canal')
    const notFound = { ok: false, error: 'Mensagem não encontrada' }
    expect(await read(ana.socket, 'lixo', msg.id)).toEqual(notFound)
    expect(await read(ana.socket, ch.id, 'lixo')).toEqual(notFound)
    expect(await ana.socket.emitWithAck('channel:read', null as never)).toEqual(notFound)
    expect(await read(ana.socket, ch.id, msg.id)).toEqual(notFound)

    const secret = await channel()
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: secret.id,
      overrides: [{ roleId: '00000000-0000-0000-0000-000000000000', allow: [], deny: ['view'] }]
    })
    const hidden = await send(owner.socket, secret.id, 'segredo')
    expect(await read(ana.socket, secret.id, hidden.id)).toEqual(notFound)
  })
})
