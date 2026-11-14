// Banco no servidor real: boot com db.json antigo, paginação do histórico e corridas.
import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { TestServer, uniqueCredentials, waitFor, type ClientSocket } from './helpers'

const open: ClientSocket[] = []
afterEach(() => {
  for (const s of open.splice(0)) s.close()
})

describe('primeiro boot com um db.json antigo', () => {
  const password = 'senha-antiga-123'
  const token = randomBytes(32).toString('base64url')
  const accountId = randomUUID()
  const channelId = randomUUID()
  let server: TestServer

  beforeAll(async () => {
    const salt = randomBytes(16)
    const hash = scryptSync(password, salt, 64)
    server = await TestServer.start({
      prepare: (dataDir) =>
        writeFileSync(
          join(dataDir, 'db.json'),
          JSON.stringify({
            accounts: [
              {
                id: accountId,
                email: 'antiga@teste.com',
                name: 'Conta Antiga',
                tag: 'velha',
                color: '#eb459e',
                passwordHash: `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`,
                googleId: null,
                avatarType: null,
                avatarVersion: 0,
                createdAt: 1
              }
            ],
            sessions: [
              { tokenHash: createHash('sha256').update(token).digest('hex'), accountId, expiresAt: Date.now() + 86_400_000 }
            ],
            channels: [{ id: channelId, name: 'canal-antigo', type: 'text', createdAt: 1 }],
            messages: {
              [channelId]: [
                { id: randomUUID(), channelId, content: 'olá do passado', createdAt: 5, author: { id: 's', accountId, name: 'Conta Antiga', tag: 'velha', color: '#eb459e' } }
              ]
            }
          })
        )
    })
  })

  afterAll(async () => {
    await server?.destroy()
  })

  it('importa tudo: a sessão salva no app continua valendo', async () => {
    const s = await server.connect(token)
    open.push(s)
    const hello = await s.emitWithAck('hello')
    expect(hello.account).toMatchObject({ id: accountId, name: 'Conta Antiga', tag: 'velha', tagLocked: true })
    // importou em vez de criar os canais padrão
    expect(hello.state.channels.map((c) => c.name)).toEqual(['canal-antigo'])
    const page = await s.emitWithAck('message:history', { channelId })
    expect(page.messages.map((m) => m.content)).toEqual(['olá do passado'])
  })

  it('a senha antiga continua funcionando', async () => {
    const res = await server.login('antiga@teste.com', password)
    expect(res.ok && res.account.id).toBe(accountId)
  })

  it('o log de inicialização diz o que foi importado e qual banco está em uso', () => {
    expect(server.log).toMatch(/\[banco\] importado de .*db\.json: 1 contas, 1 sessões, 1 canais, 1 mensagens/)
    expect(server.log).toMatch(/Banco: (PGlite em .*pgdata|PostgreSQL )/)
  })
})

describe('histórico paginado e pedidos simultâneos', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await TestServer.start()
  })

  afterAll(async () => {
    await server?.destroy()
  })

  it('primeiro boot sem db.json cria os canais padrão', () => {
    expect(server.log).toMatch(/canais padrão criados \(geral, off-topic, Sala de Voz, Jogos\)/)
  })

  it('página de 50, cursor "before" e hasMore até o começo do canal', async () => {
    const u = await server.newUser()
    open.push(u.socket)
    const created = await u.socket.emitWithAck('channel:create', { name: 'muitas', type: 'text' })
    if (!created.ok) throw new Error(created.error)
    const channelId = created.channel.id
    const last = waitFor(u.socket, 'message:new', (m) => m.content === 'm120', 10_000)
    for (let i = 1; i <= 120; i++) u.socket.emit('message:send', { channelId, content: `m${i}` })
    await last

    const p1 = await u.socket.emitWithAck('message:history', { channelId })
    expect(p1.hasMore).toBe(true)
    expect(p1.messages.map((m) => m.content)).toEqual(Array.from({ length: 50 }, (_, i) => `m${i + 71}`))
    const p2 = await u.socket.emitWithAck('message:history', { channelId, before: p1.messages[0].id })
    expect(p2.messages[0].content).toBe('m21')
    expect(p2.hasMore).toBe(true)
    const p3 = await u.socket.emitWithAck('message:history', { channelId, before: p2.messages[0].id })
    expect(p3.messages.map((m) => m.content)).toEqual(Array.from({ length: 20 }, (_, i) => `m${i + 1}`))
    expect(p3.hasMore).toBe(false)

    // não existe mais o limite antigo de 500 mensagens por canal: nada foi descartado
    const all = [...p3.messages, ...p2.messages, ...p1.messages]
    expect(new Set(all.map((m) => m.id)).size).toBe(120)
  })

  it('cursor inválido devolve página vazia', async () => {
    const u = await server.newUser()
    open.push(u.socket)
    const geral = u.state.channels.find((c) => c.name === 'geral')!
    expect(await u.socket.emitWithAck('message:history', { channelId: geral.id, before: 'lixo' })).toEqual({
      messages: [],
      hasMore: false
    })
  })

  it('dois cadastros com o mesmo id ao mesmo tempo: só um passa, o outro recebe erro amigável', async () => {
    const base = uniqueCredentials()
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => server.register({ ...uniqueCredentials(), tag: i % 2 ? base.tag.toUpperCase() : base.tag }))
    )
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    for (const r of results.filter((r) => !r.ok)) {
      expect(r.ok === false && r.error).toMatch(/já está em uso/)
    }
  })

  it('dois cadastros com o mesmo e-mail ao mesmo tempo: só um passa', async () => {
    const email = uniqueCredentials().email
    const results = await Promise.all(Array.from({ length: 4 }, () => server.register({ ...uniqueCredentials(), email })))
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    for (const r of results.filter((r) => !r.ok)) {
      expect(r.ok === false && r.error).toBe('Este e-mail já está cadastrado')
    }
  })

  it('dois canais com o mesmo nome ao mesmo tempo: só um é criado', async () => {
    const u = await server.newUser()
    open.push(u.socket)
    const name = `corrida-${randomUUID().slice(0, 6)}`
    const results = await Promise.all(
      Array.from({ length: 4 }, () => u.socket.emitWithAck('channel:create', { name, type: 'text' }))
    )
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    for (const r of results.filter((r) => !r.ok)) {
      expect(r).toEqual({ ok: false, error: 'Já existe um canal com esse nome' })
    }
  })

  it('o servidor continua de pé depois de tudo isso', async () => {
    expect((await fetch(server.url + '/')).ok).toBe(true)
    expect(server.log).not.toMatch(/\[(message:send|channel:create|http)\]/)
  })
})
