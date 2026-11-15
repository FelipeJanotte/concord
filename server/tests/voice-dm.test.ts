// Voz nas conversas privadas (v3, servidor da chamada da B8): só os dois membros entram e veem a sala,
// o bloqueio impede entrar e encerra a chamada em andamento. LiveKit falso (HTTP) como em voice.test.ts.
import { TokenVerifier } from 'livekit-server-sdk'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_EVERYONE_PERMISSIONS, EVERYONE_ROLE_ID, type DmEntry, type JoinVoiceResult } from '../../src/shared/types'
import { FakeLiveKit, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL, withEnv } from './fake-livekit'
import { expectNoEvent, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

const livekit = new FakeLiveKit()
let server: TestServer
const open: ClientSocket[] = []
let n = 0

beforeAll(async () => {
  const apiUrl = await livekit.start()
  server = await withEnv(
    { LIVEKIT_URL, LIVEKIT_API_URL: apiUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET },
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

const join = (u: TestUser, channelId: string): Promise<JoinVoiceResult> =>
  u.socket.emitWithAck('voice:join', { channelId, muted: false, deafened: false })

describe('chamada numa conversa privada', () => {
  it('os dois membros entram (token para a sala = id da conversa, com microfone e tela)', async () => {
    const a = await user()
    const b = await user()
    const dm = await friendsWithDm(a, b)
    const res = await join(a, dm.channel.id)
    if (!res.ok) throw new Error(res.error)
    expect(res).toMatchObject({ canSpeak: true, canShare: true })
    const claims = await new TokenVerifier(LIVEKIT_API_KEY, LIVEKIT_API_SECRET).verify(res.token)
    expect(claims.video).toMatchObject({ room: dm.channel.id, roomJoin: true })
    expect((await join(b, dm.channel.id)).ok).toBe(true)
  })

  it('quem é de fora (nem a dona) não entra e nem vê quem está na sala', async () => {
    const owner = await server.asOwner()
    const a = await user()
    const b = await user()
    const stranger = await user()
    const dm = await friendsWithDm(a, b)

    // o outro membro vê a pessoa entrando; quem é de fora não recebe a sala da DM
    const forB = waitFor(b.socket, 'voice:state', (list) => list.some((v) => v.channelId === dm.channel.id))
    const hiddenForStranger = expectNoEvent(stranger.socket, 'voice:state', (list) => list.some((v) => v.channelId === dm.channel.id))
    const hiddenForOwner = expectNoEvent(owner.socket, 'voice:state', (list) => list.some((v) => v.channelId === dm.channel.id))
    expect((await join(a, dm.channel.id)).ok).toBe(true)
    await forB
    await hiddenForStranger
    await hiddenForOwner

    for (const outsider of [stranger, owner]) {
      expect(await join(outsider, dm.channel.id)).toEqual({ ok: false, error: 'Canal de voz não encontrado' })
    }
  })

  it('canal de texto continua sem voz', async () => {
    const a = await user()
    const geral = a.state.channels.find((c) => c.type === 'text')!
    expect(await join(a, geral.id)).toEqual({ ok: false, error: 'Canal de voz não encontrado' })
  })

  it('bloqueio: não entra (mensagem neutra) e quem estava na chamada sai, também do LiveKit', async () => {
    const a = await user()
    const b = await user()
    const dm = await friendsWithDm(a, b)
    expect((await join(a, dm.channel.id)).ok).toBe(true)
    expect((await join(b, dm.channel.id)).ok).toBe(true)

    const emptied = waitFor(a.socket, 'voice:state', (list) => !list.some((v) => v.channelId === dm.channel.id))
    expect((await b.socket.emitWithAck('friend:block', a.account.id)).ok).toBe(true)
    await emptied
    await livekit.waitCall('RemoveParticipant', (body) => body.room === dm.channel.id && body.identity === a.socket.id)
    await livekit.waitCall('RemoveParticipant', (body) => body.room === dm.channel.id && body.identity === b.socket.id)

    for (const u of [a, b]) expect(await join(u, dm.channel.id)).toEqual({ ok: false, error: 'Não foi possível entrar na chamada' })

    // desbloquear: a conversa existente volta a ter chamada
    expect((await b.socket.emitWithAck('friend:unblock', a.account.id)).ok).toBe(true)
    expect((await join(a, dm.channel.id)).ok).toBe(true)
  })

  it('mudança de cargos não tira ninguém da chamada da conversa', async () => {
    const owner = await server.asOwner()
    const a = await user()
    const b = await user()
    const dm = await friendsWithDm(a, b)
    expect((await join(a, dm.channel.id)).ok).toBe(true)
    // @todos sem nenhuma permissão de canal: na comunidade, ninguém mais entraria em sala nenhuma
    const stays = expectNoEvent(a.socket, 'voice:state', (list) => !list.some((v) => v.channelId === dm.channel.id))
    const res = await owner.socket.emitWithAck('role:update', { id: EVERYONE_ROLE_ID, permissions: [] })
    expect(res.ok).toBe(true)
    await stays
    // devolve o padrão para não afetar os outros testes deste arquivo
    await owner.socket.emitWithAck('role:update', { id: EVERYONE_ROLE_ID, permissions: DEFAULT_EVERYONE_PERMISSIONS })
  })
})
