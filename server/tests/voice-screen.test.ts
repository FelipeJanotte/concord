import { TokenVerifier } from 'livekit-server-sdk'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, type Channel, type ChannelPermission, type ScreenCredentialsResult } from '../../src/shared/types'
import { FakeLiveKit, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL, liveKitEnv } from './fake-livekit'
import { expectNoEvent, sleep, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

const livekit = new FakeLiveKit()
const verifier = new TokenVerifier(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
let server: TestServer
let owner: TestUser
let apiUrl = ''
const open: ClientSocket[] = []

beforeAll(async () => {
  apiUrl = await livekit.start()
  server = await TestServer.start({ env: liveKitEnv(apiUrl) })
  owner = await server.asOwner()
})

afterEach(() => {
  for (const socket of open.splice(0)) socket.close()
})

afterAll(async () => {
  await server?.destroy()
  await livekit.stop()
})

async function user(name?: string, target = server): Promise<TestUser> {
  const created = await target.newUser(name)
  open.push(created.socket)
  return created
}

function voiceRoom(target = server): Promise<Channel> {
  return target.createChannel(`Tela ${Math.random().toString(36).slice(2, 8)}`, 'voice')
}

async function join(person: TestUser, channelId: string): Promise<void> {
  const result = await person.socket.emitWithAck('voice:join', { channelId, muted: false, deafened: false })
  if (!result.ok) throw new Error(result.error)
}

function screenCredentials(person: TestUser): Promise<ScreenCredentialsResult> {
  return person.socket.emitWithAck('voice:screen-credentials')
}

async function issuedToken(person: TestUser): Promise<string> {
  const result = await screenCredentials(person)
  if (!result.ok) throw new Error(result.error)
  return result.token
}

async function denyInRoom(channelId: string, deny: ChannelPermission[]): Promise<void> {
  const result = await owner.socket.emitWithAck('channel:set-overrides', { channelId, overrides: [{ roleId: EVERYONE_ROLE_ID, allow: [], deny }] })
  if (!result.ok) throw new Error(result.error)
}

function screenIdentityOf(person: TestUser): string {
  return `${person.account.id}:screen`
}

function screenRemoved(channelId: string, person: TestUser) {
  return livekit.waitCall('RemoveParticipant', (body) => body.identity === screenIdentityOf(person) && body.room === channelId)
}

describe('voice:screen-credentials', () => {
  it('na sala com "compartilhar" devolve um token só para publicar a tela, como participante <conta>:screen', async () => {
    const ana = await user('Ana')
    const room = await voiceRoom()
    await join(ana, room.id)

    const result = await screenCredentials(ana)
    expect(result).toEqual({ ok: true, url: LIVEKIT_URL, token: expect.any(String) })
    const claims = await verifier.verify(result.ok ? result.token : '')
    expect(claims.sub).toBe(`${ana.account.id}:screen`)
    expect(claims.name).toBe('Ana')
    expect(JSON.parse(claims.metadata ?? '')).toEqual({ screenOf: ana.account.id })
    expect(claims.video).toMatchObject({
      room: room.id,
      roomJoin: true,
      canPublish: true,
      canPublishSources: ['screen_share', 'screen_share_audio'],
      canSubscribe: false,
      canPublishData: false
    })
    expect(claims.video?.roomAdmin).toBeFalsy()
    expect(claims.video?.roomCreate).toBeFalsy()
  })

  it('fora de uma sala de voz recusa', async () => {
    const ana = await user()
    expect(await screenCredentials(ana)).toEqual({ ok: false, error: 'Entre numa sala de voz para compartilhar a tela' })
  })

  it('sem "compartilhar" na sala recusa', async () => {
    const ana = await user()
    const room = await voiceRoom()
    await denyInRoom(room.id, ['share'])
    await join(ana, room.id)
    expect(await screenCredentials(ana)).toEqual({ ok: false, error: 'Você não tem permissão para compartilhar a tela nesta sala' })
  })

  it('o participante da tela nunca aparece na lista de quem está na sala', async () => {
    const ana = await user()
    const bia = await user()
    const room = await voiceRoom()
    await join(ana, room.id)
    const both = waitFor(bia.socket, 'voice:state', (states) => states.some((state) => state.userId === bia.socket.id))
    await join(bia, room.id)
    await both
    const silent = expectNoEvent(bia.socket, 'voice:state')
    await issuedToken(ana)
    await silent
    const next = waitFor(bia.socket, 'voice:state', (states) => states.some((state) => state.userId === ana.socket.id && state.muted))
    ana.socket.emit('voice:update', { muted: true, deafened: false })
    const [states] = await next
    expect(states.filter((state) => state.channelId === room.id).map((state) => state.userId).sort()).toEqual([ana.socket.id, bia.socket.id].sort())
  })
})

describe('fim da tela pelo servidor', () => {
  it('sair da sala tira a tela do LiveKit', async () => {
    const ana = await user()
    const room = await voiceRoom()
    await join(ana, room.id)
    await issuedToken(ana)
    ana.socket.emit('voice:leave')
    await screenRemoved(room.id, ana)
  })

  it('desconectar tira a tela do LiveKit', async () => {
    const ana = await user()
    const room = await voiceRoom()
    await join(ana, room.id)
    await issuedToken(ana)
    ana.socket.close()
    await screenRemoved(room.id, ana)
  })

  it('trocar de sala (inclusive movida por um moderador) tira a tela da sala anterior', async () => {
    const ana = await user()
    const first = await voiceRoom()
    const second = await voiceRoom()
    await join(ana, first.id)
    await issuedToken(ana)
    const moved = waitFor(ana.socket, 'moderation:moved')
    expect(await owner.socket.emitWithAck('moderation:voice-move', { userId: ana.socket.id ?? '', channelId: second.id })).toEqual({ ok: true })
    await moved
    await join(ana, second.id)
    await screenRemoved(first.id, ana)
  })

  it('ser expulsa da voz tira a tela do LiveKit', async () => {
    const ana = await user()
    const room = await voiceRoom()
    await join(ana, room.id)
    await issuedToken(ana)
    expect(await owner.socket.emitWithAck('moderation:voice-kick', { userId: ana.socket.id ?? '' })).toEqual({ ok: true })
    await screenRemoved(room.id, ana)
  })

  it('perder "compartilhar" com a pessoa na sala tira a tela do LiveKit', async () => {
    const ana = await user()
    const room = await voiceRoom()
    await join(ana, room.id)
    await issuedToken(ana)
    await denyInRoom(room.id, ['share'])
    await screenRemoved(room.id, ana)
  })

  it('perder outra permissão sem perder "compartilhar" mantém a tela', async () => {
    const ana = await user()
    const room = await voiceRoom()
    await join(ana, room.id)
    await issuedToken(ana)
    await denyInRoom(room.id, ['video'])
    await livekit.waitCall('UpdateParticipant', (body) => body.identity === ana.socket.id && body.room === room.id)
    await sleep(150)
    expect(livekit.calls.some((call) => call.method === 'RemoveParticipant' && call.body.identity === screenIdentityOf(ana))).toBe(false)
  })
})

describe('limite', () => {
  it('pedir credenciais rápido demais é recusado (LIMITS.screenCredentials)', async () => {
    const limited = await TestServer.start({ env: { ...liveKitEnv(apiUrl), RATE_LIMIT_MULTIPLIER: '1' } })
    try {
      const ana = await user(undefined, limited)
      await join(ana, (await voiceRoom(limited)).id)
      const results: ScreenCredentialsResult[] = []
      for (let attempt = 0; attempt < 6; attempt++) results.push(await screenCredentials(ana))
      expect(results.slice(0, 5).every((result) => result.ok)).toBe(true)
      expect(results[5]).toEqual({ ok: false, error: expect.stringMatching(/^Muitos pedidos para compartilhar a tela\. Tente de novo em \d+ s\.$/) })
    } finally {
      await limited.destroy()
    }
  })
})
