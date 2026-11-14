// Conversas privadas (A7) no servidor real: abrir só entre amigos, só os dois veem, bloqueio fecha.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Attachment, DmEntry } from '../../src/shared/types'
import { expectNoEvent, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

const SECRET = 'segredo-de-teste-dos-dms'
process.env.FILES_SIGNING_SECRET = SECRET

let server: TestServer
const open: ClientSocket[] = []
let n = 0

beforeAll(async () => {
  server = await TestServer.start({ env: { FILES_SIGNING_SECRET: SECRET } })
})

afterEach(() => {
  for (const s of open.splice(0)) s.close()
})

afterAll(async () => {
  await server?.destroy()
})

async function user(): Promise<TestUser> {
  const u = await server.newUser(`Pessoa ${++n}`)
  open.push(u.socket)
  return u
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

describe('abrir conversa', () => {
  it('entre amigos: cria uma vez, a outra pessoa recebe dm:created e abrir de novo devolve a mesma', async () => {
    const a = await user()
    const b = await user()
    await friends(a, b)
    const created = waitFor(b.socket, 'dm:created')
    const dm = await openDm(a, b)
    expect(dm.channel.type).toBe('dm')
    expect(dm.other).toMatchObject({ id: b.account.id, name: b.name, tag: b.tag })
    expect((await created)[0]).toMatchObject({ channel: { id: dm.channel.id }, other: { id: a.account.id } })

    const noRepeat = expectNoEvent(b.socket, 'dm:created')
    expect((await openDm(a, b)).channel.id).toBe(dm.channel.id)
    expect((await openDm(b, a)).channel.id).toBe(dm.channel.id)
    await noRepeat
  })

  it('dois dm:open ao mesmo tempo dos dois lados dão a mesma conversa', async () => {
    const a = await user()
    const b = await user()
    await friends(a, b)
    const [x, y] = await Promise.all([openDm(a, b), openDm(b, a)])
    expect(x.channel.id).toBe(y.channel.id)
    expect(await a.socket.emitWithAck('dm:list')).toHaveLength(1)
  })

  it('minhas outras janelas também recebem dm:created', async () => {
    const a = await user()
    const b = await user()
    await friends(a, b)
    const a2 = await server.connect(a.token)
    open.push(a2)
    await a2.emitWithAck('hello')
    const other = waitFor(a2, 'dm:created')
    const dm = await openDm(a, b)
    expect((await other)[0]).toEqual(dm)
  })

  it('sem amizade não abre; erros de conta', async () => {
    const a = await user()
    const b = await user()
    expect(await a.socket.emitWithAck('dm:open', b.account.id)).toEqual({ ok: false, error: 'Vocês precisam ser amigos para conversar' })
    expect(await a.socket.emitWithAck('dm:open', a.account.id)).toEqual({ ok: false, error: 'Você não pode conversar consigo mesmo' })
    expect(await a.socket.emitWithAck('dm:open', 'lixo')).toEqual({ ok: false, error: 'Conta inválida' })
    expect(await a.socket.emitWithAck('dm:open', '11111111-1111-1111-1111-111111111111')).toEqual({
      ok: false,
      error: 'Conta não encontrada'
    })
    // pedido pendente também não basta
    await a.socket.emitWithAck('friend:request', `${b.name}#${b.tag}`)
    expect((await a.socket.emitWithAck('dm:open', b.account.id)).ok).toBe(false)
  })

  it('amizade desfeita: a conversa que já existe continua abrindo (o histórico não some)', async () => {
    const a = await user()
    const b = await user()
    await friends(a, b)
    const dm = await openDm(a, b)
    await a.socket.emitWithAck('friend:remove', b.account.id)
    expect((await openDm(b, a)).channel.id).toBe(dm.channel.id)
  })

  it('dm:list traz as minhas conversas, mais recente primeiro, com a outra pessoa', async () => {
    const a = await user()
    const b = await user()
    const c = await user()
    await friends(a, b)
    await friends(a, c)
    const first = await openDm(a, b)
    const second = await openDm(c, a)
    const list = await a.socket.emitWithAck('dm:list')
    expect(list.map((d) => [d.channel.id, d.other.id])).toEqual([
      [second.channel.id, c.account.id],
      [first.channel.id, b.account.id]
    ])
    expect((await b.socket.emitWithAck('dm:list')).map((d) => d.other.id)).toEqual([a.account.id])
  })
})

describe('só os dois veem', () => {
  it('mensagem chega só para os membros (nem a dona recebe) e o histórico é só deles', async () => {
    const owner = await server.asOwner()
    const a = await user()
    const b = await user()
    const stranger = await user()
    await friends(a, b)
    const dm = await openDm(a, b)

    const forB = waitFor(b.socket, 'message:new', (m) => m.channelId === dm.channel.id)
    const notStranger = expectNoEvent(stranger.socket, 'message:new', (m) => m.channelId === dm.channel.id)
    const notOwner = expectNoEvent(owner.socket, 'message:new', (m) => m.channelId === dm.channel.id)
    a.socket.emit('message:send', { channelId: dm.channel.id, content: 'oi, só pra você' })
    expect((await forB)[0]).toMatchObject({ content: 'oi, só pra você', author: { id: a.self.id } })
    await notStranger
    await notOwner

    expect((await b.socket.emitWithAck('message:history', { channelId: dm.channel.id })).messages.map((m) => m.content)).toEqual([
      'oi, só pra você'
    ])
    for (const outsider of [stranger, owner]) {
      expect(await outsider.socket.emitWithAck('message:history', { channelId: dm.channel.id })).toEqual({ messages: [], hasMore: false })
    }
  })

  it('quem é de fora não manda mensagem nem "digitando" na conversa', async () => {
    const a = await user()
    const b = await user()
    const stranger = await user()
    await friends(a, b)
    const dm = await openDm(a, b)
    const silent = expectNoEvent(a.socket, 'message:new', (m) => m.channelId === dm.channel.id)
    const noTyping = expectNoEvent(a.socket, 'typing', (t) => t.channelId === dm.channel.id)
    stranger.socket.emit('message:send', { channelId: dm.channel.id, content: 'intruso' })
    stranger.socket.emit('typing', dm.channel.id)
    await silent
    await noTyping

    const typing = waitFor(a.socket, 'typing', (t) => t.channelId === dm.channel.id)
    b.socket.emit('typing', dm.channel.id)
    expect((await typing)[0].userId).toBe(b.self.id)
  })

  it('anexo: os membros baixam; um link assinado para quem é de fora não abre', async () => {
    const a = await user()
    const b = await user()
    const stranger = await user()
    await friends(a, b)
    const dm = await openDm(a, b)
    const up = await server.upload(a.token, Buffer.from('segredo'), { name: 'nota.txt', type: 'text/plain' })
    if (!up.body.ok) throw new Error('upload falhou')
    const got = waitFor(b.socket, 'message:new', (m) => m.channelId === dm.channel.id)
    a.socket.emit('message:send', { channelId: dm.channel.id, content: '', attachmentIds: [up.body.attachment.id] })
    const attachment: Attachment = (await got)[0].attachments[0]
    expect((await fetch(server.url + attachment.url)).status).toBe(200)

    const { signFileUrl } = await import('../files-signing')
    expect((await fetch(server.url + signFileUrl(attachment, stranger.account.id))).status).toBe(404)
  })

  it('conversas não aparecem na lista de canais da comunidade, e ninguém apaga ou muda regras de uma', async () => {
    const owner = await server.asOwner()
    const a = await user()
    const b = await user()
    await friends(a, b)
    const dm = await openDm(a, b)
    const again = await server.connect(a.token)
    open.push(again)
    const hello = await again.emitWithAck('hello')
    expect(hello.state.channels.some((c) => c.id === dm.channel.id || c.type === 'dm')).toBe(false)

    const notDeleted = expectNoEvent(a.socket, 'channel:deleted')
    owner.socket.emit('channel:delete', dm.channel.id)
    await notDeleted
    expect(await owner.socket.emitWithAck('channel:set-overrides', { channelId: dm.channel.id, overrides: [] })).toEqual({
      ok: false,
      error: 'Canal não encontrado'
    })
    const still = waitFor(b.socket, 'message:new', (m) => m.channelId === dm.channel.id)
    a.socket.emit('message:send', { channelId: dm.channel.id, content: 'continua aqui' })
    await still
  })
})

describe('bloqueio', () => {
  it('fecha a conversa: não abre e não envia (dos dois lados); o histórico continua legível', async () => {
    const a = await user()
    const b = await user()
    await friends(a, b)
    const dm = await openDm(a, b)
    const first = waitFor(b.socket, 'message:new', (m) => m.channelId === dm.channel.id)
    a.socket.emit('message:send', { channelId: dm.channel.id, content: 'antes' })
    await first

    await b.socket.emitWithAck('friend:block', a.account.id)
    for (const [me, other] of [
      [a, b],
      [b, a]
    ] as const) {
      expect(await me.socket.emitWithAck('dm:open', other.account.id)).toEqual({ ok: false, error: 'Não foi possível abrir a conversa' })
      const silent = expectNoEvent(other.socket, 'message:new', (m) => m.channelId === dm.channel.id)
      me.socket.emit('message:send', { channelId: dm.channel.id, content: 'bloqueado' })
      await silent
    }
    expect((await a.socket.emitWithAck('message:history', { channelId: dm.channel.id })).messages.map((m) => m.content)).toEqual(['antes'])

    // desbloquear reabre a conversa que já existe (mesmo sem amizade)
    await b.socket.emitWithAck('friend:unblock', a.account.id)
    expect((await openDm(a, b)).channel.id).toBe(dm.channel.id)
    const after = waitFor(b.socket, 'message:new', (m) => m.channelId === dm.channel.id)
    a.socket.emit('message:send', { channelId: dm.channel.id, content: 'depois' })
    await after
  })
})

describe('depois de reiniciar', () => {
  it('os membros continuam vendo a conversa e quem é de fora continua sem ver', async () => {
    const a = await user()
    const b = await user()
    const stranger = await user()
    await friends(a, b)
    const dm = await openDm(a, b)
    a.socket.emit('message:send', { channelId: dm.channel.id, content: 'guardada' })
    await waitFor(b.socket, 'message:new', (m) => m.channelId === dm.channel.id)

    await server.restart()
    const a2 = await server.connect(a.token)
    const b2 = await server.connect(b.token)
    const s2 = await server.connect(stranger.token)
    open.push(a2, b2, s2)
    for (const s of [a2, b2, s2]) await s.emitWithAck('hello')

    expect((await b2.emitWithAck('message:history', { channelId: dm.channel.id })).messages.map((m) => m.content)).toEqual(['guardada'])
    expect((await s2.emitWithAck('message:history', { channelId: dm.channel.id })).messages).toEqual([])
    const notStranger = expectNoEvent(s2, 'message:new', (m) => m.channelId === dm.channel.id)
    const forB = waitFor(b2, 'message:new', (m) => m.channelId === dm.channel.id)
    a2.emit('message:send', { channelId: dm.channel.id, content: 'de novo' })
    await forB
    await notStranger
  })
})
