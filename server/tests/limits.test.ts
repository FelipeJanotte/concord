// Endurecimento no servidor real: limite de requisições (valores reais) e backup automático.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expectNoEvent, sleep, TestServer, uniqueCredentials, waitFor, type TestUser } from './helpers'

const REAL_LIMITS = { RATE_LIMIT_MULTIPLIER: '1' }

describe('limites por conta', () => {
  let server: TestServer
  let a: TestUser
  let b: TestUser

  beforeAll(async () => {
    server = await TestServer.start({ env: REAL_LIMITS, owner: false }) // "a" é a primeira conta (a dona)
    // cada cadastro gasta do limite por IP (5): aqui só 2
    a = await server.newUser('Apressada')
    b = await server.newUser('Observador')
  })

  afterAll(async () => {
    a?.socket.close()
    b?.socket.close()
    await server?.destroy()
  })

  it('mensagens: rajada de 10 passa; a 11ª é recusada com aviso e não chega aos outros', async () => {
    const ch = a.state.channels.find((c) => c.name === 'geral')!
    const tenth = waitFor(b.socket, 'message:new', (m) => m.content === 'm10')
    for (let i = 1; i <= 10; i++) a.socket.emit('message:send', { channelId: ch.id, content: `m${i}` })
    await tenth

    const limited = waitFor(a.socket, 'rate:limited')
    const notDelivered = expectNoEvent(b.socket, 'message:new', (m) => m.content === 'm11')
    a.socket.emit('message:send', { channelId: ch.id, content: 'm11' })
    const [payload] = await limited
    expect(payload.action).toBe('message')
    expect(payload.retryAfterMs).toBeGreaterThan(0)
    expect(payload.retryAfterMs).toBeLessThanOrEqual(1000)
    await notDelivered

    // o limite é por conta: o outro continua mandando
    const fromB = waitFor(a.socket, 'message:new', (m) => m.content === 'do b')
    b.socket.emit('message:send', { channelId: ch.id, content: 'do b' })
    await fromB

    // e depois de esperar, volta a passar
    await sleep(1100)
    const again = waitFor(b.socket, 'message:new', (m) => m.content === 'voltei')
    a.socket.emit('message:send', { channelId: ch.id, content: 'voltei' })
    await again
  })

  it('criar canal: 5 seguidos; o 6º recebe erro com o tempo de espera', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await a.socket.emitWithAck('channel:create', { name: `limite-${i}`, type: 'text' })
      expect(res.ok).toBe(true)
    }
    const res = await a.socket.emitWithAck('channel:create', { name: 'limite-6', type: 'text' })
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error).toMatch(/^Muitos canais criados seguidos\. Tente de novo em \d+ s\.$/)
  })

  it('sorteio de times: 5 seguidos; o 6º recebe erro com o tempo de espera', async () => {
    const geral = a.state.channels.find((c) => c.type === 'text')!
    const req = { channelId: geral.id, players: [{ name: 'Ana' }, { name: 'Bia' }], teamCount: 2 }
    for (let i = 0; i < 5; i++) expect((await b.socket.emitWithAck('tools:teams', req)).ok).toBe(true)
    const res = await b.socket.emitWithAck('tools:teams', req)
    expect(!res.ok && res.error).toMatch(/^Muitos sorteios seguidos\. Tente de novo em \d+ s\.$/)
    // o limite é um só para todas as ferramentas
    const dice = await b.socket.emitWithAck('tools:dice', { channelId: geral.id, sides: 6, count: 1 })
    expect(!dice.ok && dice.error).toMatch(/^Muitos sorteios seguidos/)
    // pedido inválido responde o erro de validação (não chega a contar como sorteio)
    expect(await b.socket.emitWithAck('tools:dice', { channelId: geral.id, sides: 1, count: 1 })).toEqual({
      ok: false,
      error: 'O dado precisa ter de 2 a 100 lados'
    })
  })

  it('votos em enquete: 20 seguidos; o 21º recebe erro com o tempo de espera', async () => {
    const geral = a.state.channels.find((c) => c.type === 'text')!
    // a enquete é criada pela outra conta (o limite de sorteios de "b" já foi gasto acima)
    const created = await a.socket.emitWithAck('tools:poll', { channelId: geral.id, question: 'Limite?', options: ['sim', 'não'] })
    if (!created.ok) throw new Error(created.error)
    // Em paralelo: o balde repõe 2 votos por segundo, então em sequência (lenta, com a máquina carregada)
    // o 21º às vezes já teria ficha nova. 30 de uma vez: 20 passam e o resto é recusado.
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => b.socket.emitWithAck('poll:vote', { messageId: created.message.id, choices: [i % 2] }))
    )
    expect(results.filter((r) => r.ok).length).toBeGreaterThanOrEqual(20)
    const refused = results.filter((r) => !r.ok)
    expect(refused.length).toBeGreaterThan(0)
    for (const r of refused) expect(!r.ok && r.error).toMatch(/^Muitos votos seguidos\. Tente de novo em \d+ s\.$/)
  })

  it('marcar como lido: 30 seguidos; o resto é recusado com o tempo de espera', async () => {
    const geral = a.state.channels.find((c) => c.type === 'text')!
    const { messages } = await b.socket.emitWithAck('message:history', { channelId: geral.id })
    const last = messages[messages.length - 1]
    const results = await Promise.all(
      Array.from({ length: 40 }, () => b.socket.emitWithAck('channel:read', { channelId: geral.id, messageId: last.id }))
    )
    expect(results.filter((r) => r.ok).length).toBeGreaterThanOrEqual(30)
    const refused = results.filter((r) => !r.ok)
    expect(refused.length).toBeGreaterThan(0)
    for (const r of refused) expect(!r.ok && r.error).toMatch(/^Muitas leituras seguidas\. Tente de novo em \d+ s\.$/)
  })

  it('perfil: 10 alterações seguidas; a 11ª é recusada', async () => {
    for (let i = 0; i < 10; i++) expect((await a.socket.emitWithAck('account:update', { name: `Nome ${i}` })).ok).toBe(true)
    const res = await a.socket.emitWithAck('account:update', { name: 'Nome 11' })
    expect(!res.ok && res.error).toMatch(/^Muitas alterações seguidas\./)
  })

  it('reordenar cargos: 10 seguidos; o 11º é recusado', async () => {
    const ids: string[] = []
    for (const name of ['Um', 'Dois']) {
      const res = await a.socket.emitWithAck('role:create', { name, color: null, permissions: [] })
      if (res.ok) ids.push(res.role.id)
    }
    for (let i = 0; i < 10; i++) expect(await a.socket.emitWithAck('role:reorder', i % 2 ? ids : [...ids].reverse())).toEqual({ ok: true })
    const res = await a.socket.emitWithAck('role:reorder', ids)
    expect(!res.ok && res.error).toMatch(/^Muitas alterações seguidas\./)
  })

  it('upload: 10 seguidos; o 11º recebe 429 com Retry-After', async () => {
    for (let i = 0; i < 10; i++) expect((await server.upload(a.token, `arquivo ${i}`)).status).toBe(200)
    const res = await fetch(server.url + '/uploads', {
      method: 'POST',
      headers: { authorization: `Bearer ${a.token}`, 'x-file-name': 'demais.txt' },
      body: 'x'
    })
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await res.json()).toMatchObject({ ok: false, error: expect.stringMatching(/^Muitos envios seguidos\./) })
  })

  it('"digitando": excesso é só ignorado', async () => {
    const ch = b.state.channels.find((c) => c.name === 'geral')!
    let received = 0
    b.socket.on('typing', (p) => {
      if (p.channelId === ch.id && p.userId === a.socket.id) received++
    })
    for (let i = 0; i < 8; i++) a.socket.emit('typing', ch.id)
    await sleep(400)
    expect(received).toBe(5)
  })
})

describe('limites por IP (cadastro e login)', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await TestServer.start({ env: REAL_LIMITS, owner: false }) // conta os cadastros por IP
  })

  afterAll(async () => {
    await server?.destroy()
  })

  it('cadastro: 5 por IP; o 6º recebe 429 e a mensagem aparece para a pessoa', async () => {
    for (let i = 0; i < 5; i++) expect((await server.register(uniqueCredentials())).ok).toBe(true)
    const res = await fetch(server.url + '/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(uniqueCredentials())
    })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
    expect(await res.json()).toEqual({ ok: false, error: expect.stringMatching(/^Muitas tentativas deste computador\./) })
  })

  it('login: 20 tentativas por IP; a 21ª recebe 429 (mesmo com senha certa)', async () => {
    const creds = uniqueCredentials()
    // o teste anterior esgotou o limite de cadastro deste IP, então as tentativas usam e-mails inexistentes
    for (let i = 0; i < 20; i++) {
      const r = await server.login(`ninguem${i}@teste.com`, 'qualquer-senha')
      expect(r).toEqual({ ok: false, error: 'E-mail ou senha incorretos' })
    }
    const res = await fetch(server.url + '/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: creds.email, password: creds.password })
    })
    expect(res.status).toBe(429)
  })
})

describe('backup automático (PGlite)', () => {
  let server: TestServer

  beforeAll(async () => {
    server = await TestServer.start({ pglite: true, env: { BACKUP_INTERVAL_MS: '600', BACKUP_KEEP: '2' } })
  })

  afterAll(async () => {
    await server?.destroy()
  })

  const backups = () => {
    const dir = join(server.dataDir, 'backups')
    return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.tar.gz')) : []
  }

  // Prazos folgados: cada backup compacta a pasta do PGlite, o que demora bem mais com a suíte inteira rodando.
  it('faz backup no boot, de novo depois do intervalo, e mantém só os 2 mais novos', { timeout: 45_000 }, async () => {
    const deadline = Date.now() + 15_000
    while (backups().length === 0 && Date.now() < deadline) await sleep(100)
    expect(backups()).toHaveLength(1)

    const count = (): number => (server.log.match(/\[backup\]/g) ?? []).length
    const more = Date.now() + 25_000
    while (count() < 3 && Date.now() < more) await sleep(200)
    expect(count()).toBeGreaterThanOrEqual(3)
    expect(backups()).toHaveLength(2)
  })

  it('reiniciar logo depois não gera backup extra', async () => {
    await server.stop()
    const before = backups()
    await server.boot()
    await sleep(150)
    expect(server.log).not.toMatch(/\[backup\] .*\.tar\.gz/)
    expect(backups()).toEqual(before)
  }, 60_000)
})
