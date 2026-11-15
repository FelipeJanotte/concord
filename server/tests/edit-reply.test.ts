// Editar mensagem (A15) e responder citando (B18) no servidor real.
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

async function send(u: TestUser, channelId: string, content: string, extra: { replyToId?: string } = {}): Promise<Message> {
  // o servidor tira os espaços das pontas
  const got = waitFor(u.socket, 'message:new', (m) => m.content === content.trim())
  u.socket.emit('message:send', { channelId, content, ...extra })
  return (await got)[0]
}

describe('editar (A15)', () => {
  it('o autor edita: todos que veem o canal recebem o texto novo e o histórico guarda com a hora da edição', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await channel()
    const msg = await send(ana, ch.id, 'oi gnete')
    const forBia = waitFor(bia.socket, 'message:edited', (e) => e.messageId === msg.id)
    expect(await ana.socket.emitWithAck('message:edit', { messageId: msg.id, content: '  oi gente  ' })).toEqual({ ok: true })
    const [edited] = await forBia
    expect(edited).toMatchObject({ channelId: ch.id, messageId: msg.id, content: 'oi gente' })
    expect(edited.editedAt).toBeGreaterThanOrEqual(msg.createdAt)
    const history = await bia.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(history.messages.find((m) => m.id === msg.id)).toMatchObject({ content: 'oi gente', editedAt: edited.editedAt })
  })

  it('mensagem nunca editada não traz editedAt; mesmo texto não conta como edição', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const msg = await send(ana, ch.id, 'igual')
    expect(msg.editedAt).toBeUndefined()
    const silent = expectNoEvent(ana.socket, 'message:edited')
    expect(await ana.socket.emitWithAck('message:edit', { messageId: msg.id, content: 'igual' })).toEqual({ ok: true })
    await silent
  })

  it('recusas: de outra pessoa (nem a dona), vazia, longa demais, inexistente e de ferramenta', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const ch = await channel()
    const msg = await send(ana, ch.id, 'minha')
    const err = (error: string) => ({ ok: false, error })
    expect(await owner.socket.emitWithAck('message:edit', { messageId: msg.id, content: 'da dona' })).toEqual(err('Você só pode editar as suas mensagens'))
    expect(await ana.socket.emitWithAck('message:edit', { messageId: msg.id, content: '   ' })).toEqual(
      err('A mensagem não pode ficar vazia (para tirar, apague)')
    )
    expect(await ana.socket.emitWithAck('message:edit', { messageId: msg.id, content: 'x'.repeat(2001) })).toEqual(
      err('A mensagem pode ter no máximo 2000 caracteres')
    )
    expect(await ana.socket.emitWithAck('message:edit', { messageId: 'nada', content: 'x' })).toEqual(err('Mensagem não encontrada'))
    expect(await ana.socket.emitWithAck('message:edit', null as never)).toEqual(err('Pedido inválido'))
    const dice = await ana.socket.emitWithAck('tools:dice', { channelId: ch.id, sides: 6, count: 1 })
    if (!dice.ok) throw new Error(dice.error)
    expect(await ana.socket.emitWithAck('message:edit', { messageId: dice.message.id, content: '🎲 d6: 6' })).toEqual(
      err('Você só pode editar as suas mensagens')
    )
  })

  it('canal que a pessoa não vê: como se a mensagem não existisse, e o aviso não vaza', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const ch = await channel()
    await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: ch.id,
      overrides: [{ roleId: '00000000-0000-0000-0000-000000000000', allow: [], deny: ['view'] }]
    })
    const msg = await send(owner, ch.id, 'segredo')
    expect(await ana.socket.emitWithAck('message:edit', { messageId: msg.id, content: 'x' })).toEqual({ ok: false, error: 'Mensagem não encontrada' })
    const silent = expectNoEvent(ana.socket, 'message:edited')
    expect(await owner.socket.emitWithAck('message:edit', { messageId: msg.id, content: 'segredo editado' })).toEqual({ ok: true })
    await silent
  })
})

describe('responder citando (B18)', () => {
  it('a resposta chega com o resumo da original e o histórico guarda', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await channel()
    const original = await send(ana, ch.id, `  pergunta   longa ${'x'.repeat(150)}`)
    const reply = await send(bia, ch.id, 'resposta', { replyToId: original.id })
    expect(reply.replyTo).toMatchObject({ id: original.id, authorName: 'Ana', authorAccountId: ana.self.accountId })
    expect(reply.replyTo!.content).toHaveLength(100)
    expect(reply.replyTo!.content.startsWith('pergunta longa x')).toBe(true)
    const history = await ana.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(history.messages.find((m) => m.id === reply.id)?.replyTo).toEqual(reply.replyTo)
    expect(history.messages.find((m) => m.id === original.id)?.replyTo).toBeUndefined()
  })

  it('editar a original muda a citação no histórico; apagar vira "mensagem apagada"', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const original = await send(ana, ch.id, 'antes')
    const reply = await send(ana, ch.id, 'resp', { replyToId: original.id })
    await ana.socket.emitWithAck('message:edit', { messageId: original.id, content: 'depois' })
    let history = await ana.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(history.messages.find((m) => m.id === reply.id)?.replyTo?.content).toBe('depois')
    expect(await ana.socket.emitWithAck('message:delete', { messageId: original.id })).toEqual({ ok: true })
    history = await ana.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(history.messages.find((m) => m.id === reply.id)?.replyTo).toEqual({ id: original.id, authorName: '', authorAccountId: null, content: '', deleted: true })
  })

  it('responder a mensagem de outro canal, inexistente ou id inválido: vai sem a citação', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const other = await channel()
    const elsewhere = await send(ana, other.id, 'em outro canal')
    const a = await send(ana, ch.id, 'r1', { replyToId: elsewhere.id })
    const b = await send(ana, ch.id, 'r2', { replyToId: '00000000-0000-0000-0000-000000000009' })
    const c = await send(ana, ch.id, 'r3', { replyToId: 'lixo' })
    expect([a.replyTo, b.replyTo, c.replyTo]).toEqual([undefined, undefined, undefined])
  })
})
