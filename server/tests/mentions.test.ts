// Menções @nome (B19) no servidor real: nomes resolvidos no envio, na edição e no histórico, e o
// @todos só com a permissão mentionEveryone.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Message, TextMessageEdited } from '../../src/shared/types'
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
const channel = () => server.createChannel(`geral-${Math.random().toString(36).slice(2, 7)}`)

/** Envia e devolve o message:new (o texto que chega pode ser diferente: @todos sem permissão). */
async function send(u: TestUser, channelId: string, content: string, marker: string): Promise<Message> {
  const got = waitFor(u.socket, 'message:new', (m) => m.content.includes(marker))
  u.socket.emit('message:send', { channelId, content })
  return (await got)[0]
}

describe('menções', () => {
  it('a mensagem chega com o nome atual de cada conta mencionada; id inexistente fica de fora', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await channel()
    const ghost = '00000000-0000-0000-0000-00000000abcd'
    const msg = await send(ana, ch.id, `oi <@${bia.self.accountId}> e <@${ghost}> [m1]`, '[m1]')
    expect(msg.mentions).toEqual([{ accountId: bia.self.accountId, name: 'Bia' }])
    const history = await bia.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(history.messages.find((m) => m.id === msg.id)?.mentions).toEqual(msg.mentions)
  })

  it('sem menção não há o campo; editar recalcula as menções', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await channel()
    const msg = await send(ana, ch.id, 'sem ninguém [m2]', '[m2]')
    expect(msg.mentions).toBeUndefined()
    const edited = waitFor(bia.socket, 'message:edited', (e) => e.messageId === msg.id)
    await ana.socket.emitWithAck('message:edit', { messageId: msg.id, content: `agora <@${bia.self.accountId}> [m2]` })
    expect(((await edited)[0] as TextMessageEdited).mentions).toEqual([{ accountId: bia.self.accountId, name: 'Bia' }])
  })

  it('@todos: sem permissão vira texto comum; com mentionEveryone (ou a dona) fica', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const ch = await channel()
    const plain = await send(ana, ch.id, 'atenção <@todos> [m3]', '[m3]')
    expect(plain.content).toBe('atenção @todos [m3]')
    const fromOwner = await send(owner, ch.id, 'atenção <@todos> [m4]', '[m4]')
    expect(fromOwner.content).toBe('atenção <@todos> [m4]')

    const role = await owner.socket.emitWithAck('role:create', { name: `avisos-${ana.tag}`, color: null, permissions: ['mentionEveryone'] })
    if (!role.ok) throw new Error(role.error)
    await owner.socket.emitWithAck('member:set-roles', { accountId: ana.self.accountId, roleIds: [role.role.id] })
    const allowed = await send(ana, ch.id, 'agora sim <@TODOS> [m5]', '[m5]')
    expect(allowed.content).toBe('agora sim <@TODOS> [m5]')
  })

  it('editar para pôr @todos sem permissão também vira texto comum', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const msg = await send(ana, ch.id, 'antes [m6]', '[m6]')
    const edited = waitFor(ana.socket, 'message:edited', (e) => e.messageId === msg.id)
    await ana.socket.emitWithAck('message:edit', { messageId: msg.id, content: '<@todos> depois [m6]' })
    expect((await edited)[0].content).toBe('@todos depois [m6]')
  })
})
