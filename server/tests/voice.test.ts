// Voz (B1): entrada na sala, token do LiveKit, estado de quem está em cada sala e
// remoção da sala no LiveKit quando a pessoa sai. Um LiveKit falso (HTTP) registra as chamadas da API.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { TokenVerifier } from 'livekit-server-sdk'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Channel, JoinVoiceResult, VoiceCredentials } from '../../src/shared/types'
import { sleep, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

const API_KEY = 'chave-de-teste'
const API_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres'
const LIVEKIT_URL = 'ws://livekit.exemplo.test:7880'

interface ApiCall {
  method: string
  body: Record<string, unknown>
  auth: string
}

/** Finge ser a API Twirp do LiveKit (RoomService) e guarda o que recebeu. */
class FakeLiveKit {
  calls: ApiCall[] = []
  private server: Server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c: Buffer) => (raw += c.toString()))
    req.on('end', () => {
      const method = req.url?.split('/').pop() ?? ''
      this.calls.push({ method, body: raw ? JSON.parse(raw) : {}, auth: req.headers.authorization ?? '' })
      // Como o LiveKit de verdade: tirar alguém que não está na sala dá 404.
      if (method === 'RemoveParticipant' && this.notFound) {
        res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ code: 'not_found', msg: 'participant not found' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    })
  })
  notFound = false

  async start(): Promise<string> {
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r))
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  stop(): Promise<void> {
    return new Promise((r) => this.server.close(() => r()))
  }

  /** Espera uma chamada que satisfaça `match` (as chamadas da API são assíncronas). */
  async waitCall(method: string, match: (body: Record<string, unknown>) => boolean = () => true): Promise<ApiCall> {
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      const call = this.calls.find((c) => c.method === method && match(c.body))
      if (call) return call
      await sleep(25)
    }
    throw new Error(`o LiveKit falso não recebeu ${method}`)
  }
}

const livekit = new FakeLiveKit()
let server: TestServer
/** Servidor sem LIVEKIT_* configurado. */
let unconfigured: TestServer
const open: ClientSocket[] = []

function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]))
  Object.assign(process.env, vars)
  return fn().finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })
}

beforeAll(async () => {
  const apiUrl = await livekit.start()
  // O servidor de teste herda process.env; o server/.env não sobrescreve o que já existe.
  server = await withEnv(
    { LIVEKIT_URL, LIVEKIT_API_URL: apiUrl, LIVEKIT_API_KEY: API_KEY, LIVEKIT_API_SECRET: API_SECRET },
    () => TestServer.start()
  )
  unconfigured = await withEnv({ LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' }, () => TestServer.start())
})

afterEach(() => {
  for (const s of open.splice(0)) s.close()
  livekit.notFound = false
})

afterAll(async () => {
  await server?.destroy()
  await unconfigured?.destroy()
  await livekit.stop()
})

async function user(name?: string, srv = server): Promise<TestUser> {
  const u = await srv.newUser(name)
  open.push(u.socket)
  return u
}

async function voiceChannel(u: TestUser): Promise<Channel> {
  const res = await u.socket.emitWithAck('channel:create', { name: `Sala ${Math.random().toString(36).slice(2, 8)}`, type: 'voice' })
  if (!res.ok) throw new Error(res.error)
  return res.channel
}

function join(u: TestUser, channelId: string, muted = false, deafened = false): Promise<JoinVoiceResult> {
  return u.socket.emitWithAck('voice:join', { channelId, muted, deafened })
}

function credentials(res: JoinVoiceResult): VoiceCredentials {
  if (!res.ok) throw new Error(`voice:join falhou: ${res.error}`)
  return res
}

const verifier = new TokenVerifier(API_KEY, API_SECRET)

describe('voice:join', () => {
  it('devolve o endereço e um token do LiveKit só para aquela sala e conexão', async () => {
    const a = await user('Ana')
    const ch = await voiceChannel(a)
    const res = credentials(await join(a, ch.id))
    expect(res).toEqual({ ok: true, url: LIVEKIT_URL, token: expect.any(String) })

    // Assinado com o segredo configurado (verify lança se não for).
    const claims = await verifier.verify(res.token)
    expect(claims.sub).toBe(a.socket.id)
    expect(claims.name).toBe(`Ana#${a.tag}`)
    expect(claims.attributes).toEqual({ accountId: a.account.id })
    expect(claims.video).toMatchObject({
      room: ch.id,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: ['microphone', 'screen_share', 'screen_share_audio']
    })
    expect(claims.video?.roomAdmin).toBeFalsy()
    expect(claims.video?.roomCreate).toBeFalsy()
    // Vale poucos minutos: só serve para conectar.
    const ttl = (claims.exp ?? 0) - Math.floor(Date.now() / 1000)
    expect(ttl).toBeGreaterThan(5 * 60)
    expect(ttl).toBeLessThanOrEqual(10 * 60)
  })

  it('a mesma conta em duas conexões recebe identidades diferentes', async () => {
    const a = await user()
    const second = await server.connect(a.token)
    open.push(second)
    await second.emitWithAck('hello')
    const ch = await voiceChannel(a)
    const t1 = await verifier.verify(credentials(await join(a, ch.id)).token)
    const t2 = await verifier.verify(credentials(await second.emitWithAck('voice:join', { channelId: ch.id, muted: false, deafened: false })).token)
    expect(t1.sub).not.toBe(t2.sub)
    expect(t1.attributes).toEqual(t2.attributes)
  })

  it('não devolve mais a lista de peers (a malha P2P acabou)', async () => {
    const a = await user()
    const ch = await voiceChannel(a)
    expect(await join(a, ch.id)).not.toHaveProperty('peers')
  })

  it('avisa todos com o estado de quem entrou', async () => {
    const a = await user()
    const b = await user()
    const ch = await voiceChannel(a)
    const state = waitFor(a.socket, 'voice:state', (s) => s.some((v) => v.userId === b.socket.id))
    credentials(await join(b, ch.id, true, false))
    const [states] = await state
    expect(states.find((v) => v.userId === b.socket.id)).toEqual({
      userId: b.socket.id,
      channelId: ch.id,
      muted: true,
      deafened: false
    })
  })

  it('recusa canal de texto, canal inexistente e payload inválido', async () => {
    const a = await user()
    const text = await a.socket.emitWithAck('channel:create', { name: `t${Date.now()}`, type: 'text' })
    if (!text.ok) throw new Error(text.error)
    const notFound = { ok: false, error: 'Canal de voz não encontrado' }
    expect(await join(a, text.channel.id)).toEqual(notFound)
    expect(await join(a, 'nao-existe')).toEqual(notFound)
    const raw = a.socket as unknown as { emitWithAck(e: string, p: unknown): Promise<unknown> }
    expect(await raw.emitWithAck('voice:join', { channelId: 42 })).toEqual(notFound)
    expect(await raw.emitWithAck('voice:join', null)).toEqual(notFound)
  })

  it('exige hello antes', async () => {
    const reg = await server.register({ email: `v${Date.now()}@teste.com`, password: 'senha-forte-123', name: 'Sem Hello', tag: 'shl' + (Date.now() % 100) })
    if (!reg.ok) throw new Error(reg.error)
    const s = await server.connect(reg.token)
    open.push(s)
    expect(await s.emitWithAck('voice:join', { channelId: 'x', muted: false, deafened: false })).toEqual({
      ok: false,
      error: 'Não autenticado'
    })
  })

  it('sem LIVEKIT_* configurado, recusa com uma mensagem clara', async () => {
    const a = await user(undefined, unconfigured)
    const ch = await voiceChannel(a)
    expect(await join(a, ch.id)).toEqual({ ok: false, error: 'A voz não está configurada neste servidor' })
    expect(a.state.voice).toEqual([])
  })
})

describe('estado e saída', () => {
  it('voice:update muda mute/deafen para todos', async () => {
    const a = await user()
    const b = await user()
    const ch = await voiceChannel(a)
    credentials(await join(a, ch.id))
    const updated = waitFor(b.socket, 'voice:state', (s) => s.some((v) => v.userId === a.socket.id && v.muted && v.deafened))
    a.socket.emit('voice:update', { muted: true, deafened: true })
    await updated
  })

  it('voice:update fora da sala é ignorado', async () => {
    const a = await user()
    a.socket.emit('voice:update', { muted: true, deafened: true })
    const b = await user()
    expect(b.state.voice.some((v) => v.userId === a.socket.id)).toBe(false)
  })

  it('voice:leave tira do estado e da sala no LiveKit', async () => {
    const a = await user()
    const b = await user()
    const ch = await voiceChannel(a)
    credentials(await join(b, ch.id))
    const gone = waitFor(a.socket, 'voice:state', (s) => !s.some((v) => v.userId === b.socket.id))
    b.socket.emit('voice:leave')
    await gone
    const call = await livekit.waitCall('RemoveParticipant', (body) => body.identity === b.socket.id)
    expect(call.body).toEqual({ room: ch.id, identity: b.socket.id })
    // A chamada vai autenticada com um token de administrador da sala.
    const adminClaims = await verifier.verify(call.auth.replace(/^Bearer /, ''))
    expect(adminClaims.video).toMatchObject({ room: ch.id, roomAdmin: true })
  })

  it('desconectar tira do estado e da sala no LiveKit', async () => {
    const a = await user()
    const b = await user()
    const ch = await voiceChannel(a)
    credentials(await join(b, ch.id))
    const bId = b.socket.id
    const gone = waitFor(a.socket, 'voice:state', (s) => !s.some((v) => v.userId === bId))
    b.socket.close()
    await gone
    await livekit.waitCall('RemoveParticipant', (body) => body.identity === bId && body.room === ch.id)
  })

  it('trocar de sala sai da anterior (também no LiveKit)', async () => {
    const a = await user()
    const room1 = await voiceChannel(a)
    const room2 = await voiceChannel(a)
    credentials(await join(a, room1.id))
    const moved = waitFor(a.socket, 'voice:state', (s) =>
      s.some((v) => v.userId === a.socket.id && v.channelId === room2.id)
    )
    const res = credentials(await join(a, room2.id))
    expect((await verifier.verify(res.token)).video?.room).toBe(room2.id)
    const [states] = await moved
    expect(states.filter((v) => v.userId === a.socket.id)).toHaveLength(1)
    await livekit.waitCall('RemoveParticipant', (body) => body.identity === a.socket.id && body.room === room1.id)
  })

  it('entrar de novo na mesma sala não tira a pessoa do LiveKit', async () => {
    const a = await user()
    const ch = await voiceChannel(a)
    credentials(await join(a, ch.id))
    const before = livekit.calls.length
    credentials(await join(a, ch.id, true))
    await sleep(200)
    expect(livekit.calls.slice(before).filter((c) => c.body.identity === a.socket.id)).toEqual([])
  })

  it('apagar o canal tira todos da voz e encerra a sala no LiveKit', async () => {
    const a = await user()
    const b = await user()
    const ch = await voiceChannel(a)
    credentials(await join(b, ch.id))
    const cleared = waitFor(a.socket, 'voice:state', (states) => !states.some((v) => v.channelId === ch.id))
    a.socket.emit('channel:delete', ch.id)
    await cleared
    expect((await livekit.waitCall('DeleteRoom', (body) => body.room === ch.id)).body).toEqual({ room: ch.id })
  })

  it('erro "não encontrado" do LiveKit ao sair não atrapalha', async () => {
    livekit.notFound = true
    const a = await user()
    const b = await user()
    const ch = await voiceChannel(a)
    credentials(await join(b, ch.id))
    b.socket.emit('voice:leave')
    await livekit.waitCall('RemoveParticipant', (body) => body.identity === b.socket.id)
    // O servidor continua respondendo normalmente.
    credentials(await join(b, ch.id))
  })
})
