// Reações em mensagens (A16) no servidor real.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Message } from '../../src/shared/types'
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
const channel = () => server.createChannel(`geral-${Math.random().toString(36).slice(2, 7)}`)

async function send(u: TestUser, channelId: string, content: string): Promise<Message> {
  const got = waitFor(u.socket, 'message:new', (m) => m.content === content)
  u.socket.emit('message:send', { channelId, content })
  return (await got)[0]
}
const react = (u: TestUser, messageId: string, emoji: string, on = true) => u.socket.emitWithAck('message:react', { messageId, emoji, on })

describe('message:react', () => {
  it('reagir manda a lista inteira para quem vê o canal; ordem de chegada; o histórico guarda', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await channel()
    const msg = await send(ana, ch.id, 'boa!')
    const first = waitFor(bia.socket, 'message:reactions', (p) => p.messageId === msg.id)
    expect(await react(bia, msg.id, '👍')).toEqual({ ok: true })
    expect((await first)[0]).toEqual({ channelId: ch.id, messageId: msg.id, reactions: [{ emoji: '👍', accountIds: [bia.self.accountId] }] })
    await react(ana, msg.id, '😂')
    const last = waitFor(bia.socket, 'message:reactions', (p) => p.reactions.length === 2 && p.reactions[0].accountIds.length === 2)
    await react(ana, msg.id, '👍')
    expect((await last)[0].reactions).toEqual([
      { emoji: '👍', accountIds: [bia.self.accountId, ana.self.accountId] },
      { emoji: '😂', accountIds: [ana.self.accountId] }
    ])
    const history = await bia.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(history.messages.find((m) => m.id === msg.id)?.reactions).toHaveLength(2)
  })

  it('reagir de novo com o mesmo não duplica; tirar some (e o histórico fica sem reactions)', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const msg = await send(ana, ch.id, 'x')
    await react(ana, msg.id, '🔥')
    await react(ana, msg.id, '🔥')
    let history = await ana.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(history.messages[0].reactions).toEqual([{ emoji: '🔥', accountIds: [ana.self.accountId] }])
    const gone = waitFor(ana.socket, 'message:reactions', (p) => p.reactions.length === 0)
    expect(await react(ana, msg.id, '🔥', false)).toEqual({ ok: true })
    await gone
    history = await ana.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(history.messages[0].reactions).toBeUndefined()
  })

  it('recusas: emoji inválido, mensagem inexistente, canal que não vê (sem vazar) e limite de emojis diferentes', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const ch = await channel()
    const msg = await send(ana, ch.id, 'y')
    const err = (error: string) => ({ ok: false, error })
    expect(await react(ana, msg.id, '')).toEqual(err('Reação inválida'))
    expect(await react(ana, msg.id, 'a b')).toEqual(err('Reação inválida'))
    expect(await react(ana, msg.id, '123456789')).toEqual(err('Reação inválida'))
    expect(await ana.socket.emitWithAck('message:react', { messageId: msg.id, emoji: '👍' } as never)).toEqual(err('Reação inválida'))
    expect(await react(ana, '00000000-0000-0000-0000-000000000001', '👍')).toEqual(err('Mensagem não encontrada'))

    const secret = await channel()
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: secret.id,
      overrides: [{ roleId: '00000000-0000-0000-0000-000000000000', allow: [], deny: ['view'] }]
    })
    const hidden = await send(owner, secret.id, 'segredo')
    expect(await react(ana, hidden.id, '👍')).toEqual(err('Mensagem não encontrada'))
    const silent = expectNoEvent(ana.socket, 'message:reactions')
    await react(owner, hidden.id, '👀')
    await silent

    const emojis = ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '🥲', '😚', '🙂']
    for (const e of emojis) expect(await react(ana, msg.id, e)).toEqual({ ok: true })
    expect(await react(ana, msg.id, '🤩')).toEqual(err('Esta mensagem já tem 20 reações diferentes'))
    // um emoji que já está lá continua valendo para outra pessoa
    expect(await react(owner, msg.id, '😀')).toEqual({ ok: true })
  })

  it('sem permissão de mandar mensagem no canal não reage', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const ch = await channel()
    const msg = await send(owner, ch.id, 'só leitura')
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: ch.id,
      overrides: [{ roleId: '00000000-0000-0000-0000-000000000000', allow: [], deny: ['send'] }]
    })
    expect(await react(ana, msg.id, '👍')).toEqual({ ok: false, error: 'Você não pode reagir neste canal' })
  })

  it('apagar a mensagem leva as reações junto (cascade)', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const msg = await send(ana, ch.id, 'tchau')
    await react(ana, msg.id, '👋')
    expect(await ana.socket.emitWithAck('message:delete', { messageId: msg.id })).toEqual({ ok: true })
    expect(await react(ana, msg.id, '👋')).toEqual({ ok: false, error: 'Mensagem não encontrada' })
  })
})
