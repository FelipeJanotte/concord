// Chamadas privadas (B8): tocar, atender, recusar, cancelar, tempo limite, desligar, sair da sala,
// bloqueio e queda de conexão. Servidor real + LiveKit falso (a chamada usa a sala da conversa).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { CallInfo, DmEntry, JoinVoiceResult } from '../../src/shared/types'
import { FakeLiveKit, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL, withEnv } from './fake-livekit'
import { expectNoEvent, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

/** toque curto para o teste do tempo limite não demorar 30 s */
const RING_MS = 1500

const livekit = new FakeLiveKit()
let server: TestServer
const open: ClientSocket[] = []
let n = 0

beforeAll(async () => {
  const apiUrl = await livekit.start()
  server = await withEnv(
    { LIVEKIT_URL, LIVEKIT_API_URL: apiUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, CALL_RING_MS: String(RING_MS) },
    () => TestServer.start()
  )
})

afterEach(() => {
  for (const s of open.splice(0)) s.close()
})

afterAll(async () => {
  await server?.destroy()
  await livekit.stop()
})

async function user(): Promise<TestUser> {
  const u = await server.newUser(`Pessoa ${++n}`)
  open.push(u.socket)
  return u
}

async function friendsWithDm(a: TestUser, b: TestUser): Promise<DmEntry> {
  expect((await a.socket.emitWithAck('friend:request', `${b.name}#${b.tag}`)).ok).toBe(true)
  expect((await b.socket.emitWithAck('friend:accept', a.account.id)).ok).toBe(true)
  const res = await a.socket.emitWithAck('dm:open', b.account.id)
  if (!res.ok) throw new Error(res.error)
  return res.dm
}

/** Duas pessoas amigas com conversa aberta. */
async function pair(): Promise<{ a: TestUser; b: TestUser; dm: string }> {
  const a = await user()
  const b = await user()
  return { a, b, dm: (await friendsWithDm(a, b)).channel.id }
}

const join = (u: TestUser, channelId: string): Promise<JoinVoiceResult> =>
  u.socket.emitWithAck('voice:join', { channelId, muted: false, deafened: false })

async function invite(a: TestUser, dm: string): Promise<CallInfo> {
  const res = await a.socket.emitWithAck('call:invite', dm)
  if (!res.ok) throw new Error(res.error)
  return res.call
}

describe('ligar e atender', () => {
  it('quem recebe vê tocando em todas as conexões; atender vira "active" para os dois', async () => {
    const { a, b, dm } = await pair()
    const other = await server.connect(b.token)
    open.push(other)
    await other.emitWithAck('hello')

    const ringing = waitFor(b.socket, 'call:updated', (c) => c.status === 'ringing')
    const ringingOther = waitFor(other, 'call:updated', (c) => c.status === 'ringing')
    const call = await invite(a, dm)
    expect(call).toMatchObject({ channelId: dm, callerId: a.account.id, calleeId: b.account.id, status: 'ringing' })
    expect((await ringing)[0]).toEqual(call)
    await ringingOther
    expect(await b.socket.emitWithAck('call:list')).toEqual([call])

    const activeForA = waitFor(a.socket, 'call:updated', (c) => c.status === 'active')
    const res = await b.socket.emitWithAck('call:accept', dm)
    expect(res).toMatchObject({ ok: true, call: { status: 'active' } })
    await activeForA
  })

  it('só quem recebe atende ou recusa; só quem ligou cancela', async () => {
    const { a, b, dm } = await pair()
    await invite(a, dm)
    expect(await a.socket.emitWithAck('call:accept', dm)).toEqual({ ok: false, error: 'Essa chamada não está tocando' })
    expect(await a.socket.emitWithAck('call:decline', dm)).toEqual({ ok: false, error: 'Essa chamada não está tocando' })
    expect(await b.socket.emitWithAck('call:cancel', dm)).toEqual({ ok: false, error: 'Essa chamada não está tocando' })
    expect((await a.socket.emitWithAck('call:cancel', dm)).ok).toBe(true)
  })

  it('recusar e cancelar encerram para os dois com o motivo', async () => {
    const { a, b, dm } = await pair()
    await invite(a, dm)
    const declined = waitFor(a.socket, 'call:ended', (e) => e.channelId === dm)
    expect(await b.socket.emitWithAck('call:decline', dm)).toEqual({ ok: true })
    expect((await declined)[0]).toEqual({ channelId: dm, callerId: a.account.id, calleeId: b.account.id, reason: 'declined' })

    await invite(a, dm)
    const cancelled = waitFor(b.socket, 'call:ended', (e) => e.channelId === dm)
    expect(await a.socket.emitWithAck('call:cancel', dm)).toEqual({ ok: true })
    expect((await cancelled)[0].reason).toBe('cancelled')
    expect(await a.socket.emitWithAck('call:list')).toEqual([])
  })

  it('sem resposta a tempo: "missed" para os dois', async () => {
    const { a, b, dm } = await pair()
    await invite(a, dm)
    const forA = waitFor(a.socket, 'call:ended', () => true, RING_MS + 3000)
    const forB = waitFor(b.socket, 'call:ended', () => true, RING_MS + 3000)
    expect((await forA)[0].reason).toBe('missed')
    expect((await forB)[0].reason).toBe('missed')
  })
})

describe('recusas ao ligar', () => {
  it('conversa que não é minha, chamada repetida, gente ocupada', async () => {
    const { a, b, dm } = await pair()
    const c = await user()
    const d = await user()
    const dm2 = (await friendsWithDm(c, b)).channel.id
    const dm3 = (await friendsWithDm(a, d)).channel.id

    expect(await c.socket.emitWithAck('call:invite', dm)).toEqual({ ok: false, error: 'Conversa não encontrada' })
    expect(await c.socket.emitWithAck('call:invite', 'nada')).toEqual({ ok: false, error: 'Conversa não encontrada' })

    await invite(a, dm)
    expect(await b.socket.emitWithAck('call:invite', dm)).toEqual({ ok: false, error: 'Já há uma chamada nesta conversa' })
    expect(await c.socket.emitWithAck('call:invite', dm2)).toEqual({ ok: false, error: 'Essa pessoa está em outra chamada' })
    expect(await a.socket.emitWithAck('call:invite', dm3)).toEqual({ ok: false, error: 'Você já está em outra chamada' })
  })

  it('com bloqueio não liga (mensagem neutra); bloquear encerra a chamada em andamento', async () => {
    const { a, b, dm } = await pair()
    await invite(a, dm)
    const ended = waitFor(a.socket, 'call:ended', (e) => e.channelId === dm)
    expect((await b.socket.emitWithAck('friend:block', a.account.id)).ok).toBe(true)
    expect((await ended)[0].reason).toBe('blocked')
    expect(await a.socket.emitWithAck('call:invite', dm)).toEqual({ ok: false, error: 'Não foi possível ligar' })
  })
})

describe('durante a chamada', () => {
  it('desligar encerra para os dois e tira todo mundo da sala (também do LiveKit)', async () => {
    const { a, b, dm } = await pair()
    await invite(a, dm)
    expect((await join(a, dm)).ok).toBe(true)
    expect((await b.socket.emitWithAck('call:accept', dm)).ok).toBe(true)
    expect((await join(b, dm)).ok).toBe(true)

    const ended = waitFor(b.socket, 'call:ended', (e) => e.channelId === dm)
    const emptied = waitFor(b.socket, 'voice:state', (list) => !list.some((v) => v.channelId === dm))
    expect(await a.socket.emitWithAck('call:end', dm)).toEqual({ ok: true })
    expect((await ended)[0].reason).toBe('ended')
    await emptied
    await livekit.waitCall('RemoveParticipant', (body) => body.room === dm && body.identity === b.socket.id)
    expect(await a.socket.emitWithAck('call:end', dm)).toEqual({ ok: false, error: 'Nenhuma chamada nesta conversa' })
  })

  it('a chamada continua com uma pessoa na sala e acaba quando a última sai', async () => {
    const { a, b, dm } = await pair()
    await invite(a, dm)
    expect((await join(a, dm)).ok).toBe(true)
    expect((await b.socket.emitWithAck('call:accept', dm)).ok).toBe(true)
    expect((await join(b, dm)).ok).toBe(true)

    const noEnd = expectNoEvent(a.socket, 'call:ended')
    b.socket.emit('voice:leave')
    await noEnd
    const ended = waitFor(b.socket, 'call:ended', (e) => e.channelId === dm)
    a.socket.emit('voice:leave')
    expect((await ended)[0].reason).toBe('ended')
  })

  it('atendida e ninguém entra na sala a tempo: encerra', async () => {
    const { a, b, dm } = await pair()
    await invite(a, dm)
    expect((await b.socket.emitWithAck('call:accept', dm)).ok).toBe(true)
    const ended = waitFor(a.socket, 'call:ended', () => true, RING_MS + 3000)
    expect((await ended)[0].reason).toBe('ended')
  })
})

describe('queda de conexão enquanto toca', () => {
  it('quem ligou caiu: "cancelled"; quem recebe caiu (todas as conexões): "missed"', async () => {
    const { a, b, dm } = await pair()
    await invite(a, dm)
    const cancelled = waitFor(b.socket, 'call:ended', (e) => e.channelId === dm)
    a.socket.close()
    expect((await cancelled)[0].reason).toBe('cancelled')

    const c = await user()
    const dm2 = (await friendsWithDm(c, b)).channel.id
    await invite(c, dm2)
    const missed = waitFor(c.socket, 'call:ended', (e) => e.channelId === dm2)
    b.socket.close()
    expect((await missed)[0].reason).toBe('missed')
  })

  it('com outra conexão aberta, a chamada continua tocando', async () => {
    const { a, b, dm } = await pair()
    const other = await server.connect(b.token)
    open.push(other)
    await other.emitWithAck('hello')
    await invite(a, dm)
    const noEnd = expectNoEvent(a.socket, 'call:ended')
    b.socket.close()
    await noEnd
    expect((await other.emitWithAck('call:accept', dm)).ok).toBe(true)
  })
})
