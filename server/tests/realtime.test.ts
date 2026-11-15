// Eventos Socket.IO: presença, canais, mensagens, "digitando" e perfil. Voz: tests/voice.test.ts.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Channel } from '../../src/shared/types'
import { expectNoEvent, TestServer, uniqueCredentials, waitFor, type ClientSocket, type TestUser } from './helpers'

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

async function user(name?: string): Promise<TestUser> {
  const u = await server.newUser(name)
  open.push(u.socket)
  return u
}

/** Canal novo, criado pela dona (só quem tem manageChannels cria). */
async function newChannel(_u: TestUser, type: 'text' | 'voice'): Promise<Channel> {
  return server.createChannel(`c ${Math.random().toString(36).slice(2, 8)}`, type)
}

describe('presença', () => {
  it('avisa os outros quando alguém entra e sai', async () => {
    const a = await user('Ana')
    const creds = uniqueCredentials('Bia')
    const reg = await server.register(creds)
    if (!reg.ok) throw new Error(reg.error)
    const b = await server.connect(reg.token)
    open.push(b)

    const joined = waitFor(a.socket, 'user:joined', (u) => u.id === b.id)
    const hello = await b.emitWithAck('hello')
    const [joinedUser] = await joined
    expect(joinedUser).toMatchObject({ name: 'Bia', tag: creds.tag, accountId: reg.account.id })
    expect(hello.state.users.some((u) => u.id === a.socket.id)).toBe(true)

    const left = waitFor(a.socket, 'user:left', (id) => id === hello.self.id)
    b.close()
    await left
  })

  it('hello repetido na mesma conexão não anuncia de novo', async () => {
    const a = await user()
    const reg = await server.register(uniqueCredentials())
    if (!reg.ok) throw new Error(reg.error)
    const b = await server.connect(reg.token)
    open.push(b)
    const first = waitFor(a.socket, 'user:joined', (u) => u.id === b.id)
    await b.emitWithAck('hello')
    await first
    const noRepeat = expectNoEvent(a.socket, 'user:joined', (u) => u.id === b.id)
    await b.emitWithAck('hello')
    await noRepeat
  })

  it('a mesma conta em duas conexões aparece duas vezes (uma por socket)', async () => {
    const a = await user()
    const second = await server.connect(a.token)
    open.push(second)
    const hello = await second.emitWithAck('hello')
    expect(hello.state.users.filter((u) => u.accountId === a.account.id)).toHaveLength(2)
  })

  it('ignora ações antes do hello', async () => {
    const creds = uniqueCredentials()
    const reg = await server.register(creds)
    if (!reg.ok) throw new Error(reg.error)
    const s = await server.connect(reg.token)
    open.push(s)
    expect(await s.emitWithAck('channel:create', { name: 'x', type: 'text' })).toEqual({
      ok: false,
      error: 'Não autenticado'
    })
    expect(await s.emitWithAck('message:history', { channelId: 'qualquer' })).toEqual({ messages: [], hasMore: false })
  })
})

describe('canais', () => {
  it('cria canal de texto normalizando o nome e avisa todos', async () => {
    const a = await server.asOwner()
    const b = await user()
    const created = waitFor(b.socket, 'channel:created', (c) => c.name === 'meu-canal-novo')
    const res = await a.socket.emitWithAck('channel:create', { name: '  Meu   Canal Novo ', type: 'text' })
    expect(res.ok && res.channel).toMatchObject({ name: 'meu-canal-novo', type: 'text' })
    await created
  })

  it('quem não tem "gerenciar canais" não cria nem apaga canal', async () => {
    const a = await user()
    expect(await a.socket.emitWithAck('channel:create', { name: 'nao-pode', type: 'text' })).toEqual({
      ok: false,
      error: 'Você não tem permissão para criar canais'
    })
    const geral = a.state.channels.find((c) => c.name === 'geral')!
    const silent = expectNoEvent(a.socket, 'channel:deleted')
    a.socket.emit('channel:delete', geral.id)
    await silent
  })

  it('canal de voz mantém maiúsculas e espaços simples', async () => {
    const a = await server.asOwner()
    const res = await a.socket.emitWithAck('channel:create', { name: 'Sala  Dos Amigos', type: 'voice' })
    expect(res.ok && res.channel.name).toBe('Sala Dos Amigos')
  })

  it('corta o nome em 32 caracteres', async () => {
    const a = await server.asOwner()
    const res = await a.socket.emitWithAck('channel:create', { name: 'x'.repeat(50), type: 'text' })
    expect(res.ok && res.channel.name).toHaveLength(32)
  })

  it('recusa nome vazio e nome repetido no mesmo tipo', async () => {
    const a = await server.asOwner()
    expect(await a.socket.emitWithAck('channel:create', { name: '   ', type: 'text' })).toEqual({
      ok: false,
      error: 'Dê um nome ao canal'
    })
    expect(await a.socket.emitWithAck('channel:create', { name: 'GERAL', type: 'text' })).toEqual({
      ok: false,
      error: 'Já existe um canal com esse nome'
    })
  })

  it('apagar canal remove mensagens e avisa (a parte da voz fica em voice.test.ts)', async () => {
    const a = await server.asOwner()
    const b = await user()
    const text = await newChannel(a, 'text')
    a.socket.emit('message:send', { channelId: text.id, content: 'oi' })
    await waitFor(b.socket, 'message:new', (m) => m.channelId === text.id)

    const deleted = waitFor(b.socket, 'channel:deleted', (id) => id === text.id)
    a.socket.emit('channel:delete', text.id)
    await deleted
    expect((await b.socket.emitWithAck('message:history', { channelId: text.id })).messages).toEqual([])
  })

  it('apagar canal inexistente não faz nada', async () => {
    const a = await server.asOwner()
    const silent = expectNoEvent(a.socket, 'channel:deleted')
    a.socket.emit('channel:delete', 'nao-existe')
    await silent
  })
})

describe('mensagens', () => {
  it('envia para todos com o autor e guarda no histórico', async () => {
    const a = await user('Autor')
    const b = await user()
    const ch = await newChannel(a, 'text')
    const got = waitFor(b.socket, 'message:new', (m) => m.channelId === ch.id)
    a.socket.emit('message:send', { channelId: ch.id, content: '   olá mundo  ' })
    const [msg] = await got
    expect(msg).toMatchObject({ content: 'olá mundo', author: { accountId: a.account.id, name: 'Autor' } })
    // No histórico, author.id é o id da conta (em message:new é o socket de quem enviou).
    expect(await b.socket.emitWithAck('message:history', { channelId: ch.id })).toEqual({
      messages: [{ ...msg, author: { ...msg.author, id: a.account.id } }],
      hasMore: false
    })
  })

  it('mantém a ordem de envio', async () => {
    const a = await user()
    const ch = await newChannel(a, 'text')
    const last = waitFor(a.socket, 'message:new', (m) => m.content === 'm5')
    for (let i = 1; i <= 5; i++) a.socket.emit('message:send', { channelId: ch.id, content: `m${i}` })
    await last
    const history = await a.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(history.messages.map((m) => m.content)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
  })

  it('corta em 2000 caracteres', async () => {
    const a = await user()
    const ch = await newChannel(a, 'text')
    const got = waitFor(a.socket, 'message:new', (m) => m.channelId === ch.id)
    a.socket.emit('message:send', { channelId: ch.id, content: 'a'.repeat(2500) })
    expect((await got)[0].content).toHaveLength(2000)
  })

  it('ignora mensagem vazia e canal inexistente', async () => {
    const a = await user()
    const text = await newChannel(a, 'text')
    const silent = expectNoEvent(a.socket, 'message:new')
    a.socket.emit('message:send', { channelId: text.id, content: '    ' })
    a.socket.emit('message:send', { channelId: 'nao-existe', content: 'oi' })
    await silent
  })

  it('chat de texto da sala de voz: manda, todos que veem recebem (mesmo fora da voz) e fica no histórico', async () => {
    const a = await user('Ana')
    const b = await user('Bia') // não entrou na voz
    const voice = await newChannel(a, 'voice')
    const got = waitFor(b.socket, 'message:new', (m) => m.channelId === voice.id)
    a.socket.emit('message:send', { channelId: voice.id, content: 'alguém joga?' })
    expect((await got)[0]).toMatchObject({ channelId: voice.id, content: 'alguém joga?', author: { name: 'Ana' } })
    const page = await b.socket.emitWithAck('message:history', { channelId: voice.id })
    expect(page.messages.map((m) => m.content)).toEqual(['alguém joga?'])
  })

  it('"digitando" vai para os outros, não para quem digita', async () => {
    const a = await user('Digitador')
    const b = await user()
    const ch = await newChannel(a, 'text')
    const typing = waitFor(b.socket, 'typing', (p) => p.channelId === ch.id)
    const notMe = expectNoEvent(a.socket, 'typing', (p) => p.channelId === ch.id)
    a.socket.emit('typing', ch.id)
    expect((await typing)[0]).toEqual({ channelId: ch.id, userId: a.socket.id, name: 'Digitador' })
    await notMe
  })
})

describe('perfil', () => {
  it('troca o nome e avisa todos, inclusive nas mensagens novas', async () => {
    const a = await user('Antigo')
    const b = await user()
    const updated = waitFor(b.socket, 'user:updated', (p) => p.accountId === a.account.id)
    const res = await a.socket.emitWithAck('account:update', { name: 'Novo Nome' })
    expect(res.ok && res.account.name).toBe('Novo Nome')
    expect((await updated)[0]).toEqual({ accountId: a.account.id, name: 'Novo Nome', tag: a.tag, avatarUrl: null })

    const ch = await newChannel(a, 'text')
    const msg = waitFor(b.socket, 'message:new', (m) => m.channelId === ch.id)
    a.socket.emit('message:send', { channelId: ch.id, content: 'oi' })
    expect((await msg)[0].author.name).toBe('Novo Nome')
  })

  it('o id (tag) travado não pode mudar', async () => {
    const a = await user()
    expect(await a.socket.emitWithAck('account:update', { name: a.name, tag: 'outro' })).toEqual({
      ok: false,
      error: 'O id não pode ser alterado'
    })
  })

  it('recusa nome inválido', async () => {
    const a = await user()
    const res = await a.socket.emitWithAck('account:update', { name: 'x' })
    expect(res.ok).toBe(false)
  })
})
