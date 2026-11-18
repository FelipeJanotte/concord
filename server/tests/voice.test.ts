// Voz (B1): entrada na sala, token do LiveKit, estado de quem está em cada sala e
// remoção da sala no LiveKit quando a pessoa sai. Um LiveKit falso (HTTP) registra as chamadas da API.
import { TokenVerifier } from 'livekit-server-sdk'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Channel, JoinVoiceResult, VoiceCredentials, VoiceState } from '../../src/shared/types'
import {
  FakeLiveKit,
  LIVEKIT_API_KEY as API_KEY,
  LIVEKIT_API_SECRET as API_SECRET,
  LIVEKIT_URL,
  withEnv
} from './fake-livekit'
import { expectNoEvent, sleep, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

const livekit = new FakeLiveKit()
let server: TestServer
/** Servidor sem LIVEKIT_* configurado. */
let unconfigured: TestServer
const open: ClientSocket[] = []
let apiUrl = ''

beforeAll(async () => {
  apiUrl = await livekit.start()
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

/** Sala nova, criada pela dona do servidor (v2: só quem tem manageChannels cria canal). */
async function voiceChannel(_u: TestUser, srv = server): Promise<Channel> {
  return srv.createChannel(`Sala ${Math.random().toString(36).slice(2, 8)}`, 'voice')
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
    // v2: também diz se pode falar e compartilhar (o @todos padrão pode as duas coisas)
    expect(res).toEqual({ ok: true, url: LIVEKIT_URL, token: expect.any(String), canSpeak: true, canShare: true, canVideo: true })

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
      canPublishSources: ['microphone', 'screen_share', 'screen_share_audio', 'camera']
    })
    expect(claims.video?.roomAdmin).toBeFalsy()
    expect(claims.video?.roomCreate).toBeFalsy()
    // Vale ~1 minuto: só serve para conectar, e quem foi tirado da sala não volta com um token guardado.
    const ttl = (claims.exp ?? 0) - Math.floor(Date.now() / 1000)
    expect(ttl).toBeGreaterThan(30)
    expect(ttl).toBeLessThanOrEqual(60)
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
      deafened: false,
      sharing: false,
      serverMuted: false
    })
  })

  it('recusa canal de texto, canal inexistente e payload inválido', async () => {
    const a = await user()
    const text = await server.createChannel(`t${Date.now()}`, 'text')
    const notFound = { ok: false, error: 'Canal de voz não encontrado' }
    expect(await join(a, text.id)).toEqual(notFound)
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
    const ch = await voiceChannel(a, unconfigured)
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

  it('voice:sharing liga e desliga o indicador "ao vivo" para todos', async () => {
    const a = await user()
    const b = await user()
    const ch = await voiceChannel(a)
    credentials(await join(a, ch.id))
    const on = waitFor(b.socket, 'voice:state', (s) => s.some((v) => v.userId === a.socket.id && v.sharing))
    a.socket.emit('voice:sharing', true)
    await on
    const off = waitFor(b.socket, 'voice:state', (s) => s.some((v) => v.userId === a.socket.id && !v.sharing))
    a.socket.emit('voice:sharing', false)
    await off
  })

  it('voice:sharing ignora valor que não é booleano, repetido e fora da sala', async () => {
    const a = await user()
    const b = await user()
    const ch = await voiceChannel(a)
    // fora da sala: nada acontece
    const outside = expectNoEvent(b.socket, 'voice:state')
    a.socket.emit('voice:sharing', true)
    await outside
    credentials(await join(a, ch.id))
    await sleep(100)
    const raw = a.socket as unknown as { emit(e: string, p: unknown): void }
    const silent = expectNoEvent(b.socket, 'voice:state')
    raw.emit('voice:sharing', 'sim')
    raw.emit('voice:sharing', 1)
    a.socket.emit('voice:sharing', false) // já era false
    await silent
  })

  it('trocar de sala zera o compartilhamento de tela', async () => {
    const a = await user()
    const room1 = await voiceChannel(a)
    const room2 = await voiceChannel(a)
    credentials(await join(a, room1.id))
    const sharing = waitFor(a.socket, 'voice:state', (s) => s.some((v) => v.userId === a.socket.id && v.sharing))
    a.socket.emit('voice:sharing', true)
    await sharing
    const moved = waitFor(a.socket, 'voice:state', (s) => s.some((v) => v.userId === a.socket.id && v.channelId === room2.id))
    credentials(await join(a, room2.id))
    const [states] = await moved
    expect(states.find((v) => v.userId === a.socket.id)?.sharing).toBe(false)
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
    // v2: apagar canal exige manageChannels (a dona)
    ;(await server.asOwner()).socket.emit('channel:delete', ch.id)
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

describe('voice:watching', () => {
  type Raw = { emit(e: string, p: unknown): void }
  type States = VoiceState[]
  const latest = new Map<TestUser, States>()

  function tracked(u: TestUser): TestUser {
    u.socket.on('voice:state', (states) => latest.set(u, states))
    return u
  }

  async function room(srv = server): Promise<{ sharer: TestUser; viewer: TestUser; other: TestUser; ch: Channel }> {
    const sharer = tracked(await user(undefined, srv))
    const viewer = tracked(await user(undefined, srv))
    const other = tracked(await user(undefined, srv))
    const ch = await voiceChannel(sharer, srv)
    for (const u of [sharer, viewer, other]) credentials(await join(u, ch.id))
    const live = waitFor(other.socket, 'voice:state', (s) => s.some((v) => v.userId === sharer.socket.id && v.sharing))
    sharer.socket.emit('voice:sharing', true)
    await live
    return { sharer, viewer, other, ch }
  }

  function idOf(u: TestUser): string {
    return u.socket.id ?? ''
  }

  function watchingOf(u: TestUser, target: TestUser): string[] | undefined {
    return latest.get(u)?.find((v) => v.userId === target.socket.id)?.watching
  }

  function watches(viewer: TestUser, screen: TestUser) {
    return (states: States) => !!states.find((v) => v.userId === viewer.socket.id)?.watching?.includes(idOf(screen))
  }

  function stoppedWatching(viewer: TestUser) {
    return (states: States) => {
      const state = states.find((v) => v.userId === viewer.socket.id)
      return !!state && (state.watching ?? []).length === 0
    }
  }

  it('quem está na sala recebe quem está assistindo cada tela', async () => {
    const { sharer, viewer, other } = await room()
    const toSharer = waitFor(sharer.socket, 'voice:state', watches(viewer, sharer))
    const toOther = waitFor(other.socket, 'voice:state', watches(viewer, sharer))
    viewer.socket.emit('voice:watching', [idOf(sharer)])
    await Promise.all([toSharer, toOther])
    expect(watchingOf(sharer, viewer)).toEqual([sharer.socket.id])
  })

  it('quem vê a sala de fora não recebe quem está assistindo', async () => {
    const { sharer, viewer } = await room()
    const outsider = await user()
    const elsewhere = await voiceChannel(outsider)
    credentials(await join(outsider, elsewhere.id))
    const leak = expectNoEvent(outsider.socket, 'voice:state', (s) => s.some((v) => v.watching !== undefined && v.channelId !== elsewhere.id))
    const seen = waitFor(sharer.socket, 'voice:state', watches(viewer, sharer))
    viewer.socket.emit('voice:watching', [idOf(sharer)])
    await seen
    await leak
  })

  it('só aceita telas de quem está na mesma sala, sem a própria e sem repetir', async () => {
    const { sharer, viewer, other } = await room()
    const stranger = await user()
    credentials(await join(stranger, (await voiceChannel(stranger)).id))
    stranger.socket.emit('voice:sharing', true)
    viewer.socket.emit('voice:sharing', true)
    await sleep(100)
    const seen = waitFor(other.socket, 'voice:state', watches(viewer, sharer))
    viewer.socket.emit('voice:watching', [idOf(stranger), idOf(viewer), 'nao-existe', idOf(sharer), idOf(sharer)])
    await seen
    expect(watchingOf(other, viewer)).toEqual([sharer.socket.id])
  })

  it('só conta a tela de quem está compartilhando, inclusive quando a tela chega depois do aviso', async () => {
    const { sharer, viewer, other } = await room()
    viewer.socket.emit('voice:watching', [idOf(other)])
    await sleep(150)
    expect(watchingOf(sharer, viewer) ?? []).toEqual([])
    const live = waitFor(sharer.socket, 'voice:state', watches(viewer, other))
    other.socket.emit('voice:sharing', true)
    await live
  })

  it('recusa lista inválida, grande demais ou fora da sala', async () => {
    const { sharer, viewer, other } = await room()
    const raw = viewer.socket as unknown as Raw
    const silent = expectNoEvent(other.socket, 'voice:state')
    raw.emit('voice:watching', idOf(sharer))
    raw.emit('voice:watching', [42])
    raw.emit('voice:watching', null)
    raw.emit('voice:watching', Array.from({ length: 26 }, () => idOf(sharer)))
    await silent
    const outside = await user()
    const silentOutside = expectNoEvent(other.socket, 'voice:state')
    outside.socket.emit('voice:watching', [idOf(sharer)])
    await silentOutside
  })

  it('mudar a lista rápido demais é ignorado (LIMITS.screenWatching)', async () => {
    const limited = await withEnv(
      { LIVEKIT_URL, LIVEKIT_API_URL: apiUrl, LIVEKIT_API_KEY: API_KEY, LIVEKIT_API_SECRET: API_SECRET },
      () => TestServer.start({ env: { RATE_LIMIT_MULTIPLIER: '1' } })
    )
    try {
      const { sharer, viewer, other } = await room(limited)
      for (let i = 0; i <= 10; i++) viewer.socket.emit('voice:watching', i % 2 === 0 ? [idOf(sharer)] : [])
      await sleep(200)
      expect(watchingOf(other, viewer)).toEqual([])
    } finally {
      await limited.destroy()
    }
  })

  it('repetir a mesma lista não avisa de novo', async () => {
    const { sharer, viewer, other } = await room()
    const seen = waitFor(other.socket, 'voice:state', watches(viewer, sharer))
    viewer.socket.emit('voice:watching', [idOf(sharer)])
    await seen
    const silent = expectNoEvent(other.socket, 'voice:state')
    viewer.socket.emit('voice:watching', [idOf(sharer)])
    await silent
  })

  it('parar de assistir tira da lista', async () => {
    const { sharer, viewer } = await room()
    const seen = waitFor(sharer.socket, 'voice:state', watches(viewer, sharer))
    viewer.socket.emit('voice:watching', [idOf(sharer)])
    await seen
    const stopped = waitFor(sharer.socket, 'voice:state', stoppedWatching(viewer))
    viewer.socket.emit('voice:watching', [])
    await stopped
  })

  it('parar de compartilhar limpa quem assistia, e voltar a compartilhar não volta a contar', async () => {
    const { sharer, viewer, other } = await room()
    const seen = waitFor(other.socket, 'voice:state', watches(viewer, sharer))
    viewer.socket.emit('voice:watching', [idOf(sharer)])
    await seen
    const cleared = waitFor(other.socket, 'voice:state', stoppedWatching(viewer))
    sharer.socket.emit('voice:sharing', false)
    await cleared
    const again = waitFor(other.socket, 'voice:state', (s) => s.some((v) => v.userId === sharer.socket.id && v.sharing))
    sharer.socket.emit('voice:sharing', true)
    await again
    expect(watchingOf(other, viewer)).toEqual([])
  })

  it('quem compartilha sair da sala ou desconectar limpa quem assistia', async () => {
    const left = await room()
    const seenLeft = waitFor(left.other.socket, 'voice:state', watches(left.viewer, left.sharer))
    left.viewer.socket.emit('voice:watching', [idOf(left.sharer)])
    await seenLeft
    const clearedLeft = waitFor(left.other.socket, 'voice:state', stoppedWatching(left.viewer))
    left.sharer.socket.emit('voice:leave')
    await clearedLeft

    const gone = await room()
    const seenGone = waitFor(gone.other.socket, 'voice:state', watches(gone.viewer, gone.sharer))
    gone.viewer.socket.emit('voice:watching', [idOf(gone.sharer)])
    await seenGone
    const clearedGone = waitFor(gone.other.socket, 'voice:state', stoppedWatching(gone.viewer))
    gone.sharer.socket.close()
    await clearedGone
  })

  it('quem assiste trocar de sala deixa de contar, mesmo voltando', async () => {
    const { sharer, viewer, ch } = await room()
    const seen = waitFor(sharer.socket, 'voice:state', watches(viewer, sharer))
    viewer.socket.emit('voice:watching', [idOf(sharer)])
    await seen
    const moved = waitFor(sharer.socket, 'voice:state', (s) => !s.some((v) => v.userId === viewer.socket.id && v.channelId === ch.id))
    credentials(await join(viewer, (await voiceChannel(viewer)).id))
    await moved
    const back = waitFor(sharer.socket, 'voice:state', (s) => s.some((v) => v.userId === viewer.socket.id && v.channelId === ch.id))
    credentials(await join(viewer, ch.id))
    await back
    expect(watchingOf(sharer, viewer)).toEqual([])
  })
})
