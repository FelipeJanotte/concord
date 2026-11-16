import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  EVERYONE_ROLE_ID,
  SCREEN_PREVIEW_MAX_CHARS,
  SCREEN_PREVIEW_PREFIX,
  type Channel,
  type ChannelPermission,
  type ScreenPreviewResult
} from '../../src/shared/types'
import { FakeLiveKit, liveKitEnv } from './fake-livekit'
import { TestServer, waitFor, type TestUser } from './helpers'

const livekit = new FakeLiveKit()
let server: TestServer
const open: TestUser[] = []

beforeAll(async () => {
  server = await TestServer.start({ env: liveKitEnv(await livekit.start()) })
})

afterEach(() => {
  for (const u of open.splice(0)) u.socket.close()
})

afterAll(async () => {
  await server?.destroy()
  await livekit.stop()
})

const IMAGE = `${SCREEN_PREVIEW_PREFIX}AAAA`

async function user(name?: string): Promise<TestUser> {
  const u = await server.newUser(name)
  open.push(u)
  return u
}

async function owner(): Promise<TestUser> {
  const u = await server.asOwner()
  open.push(u)
  return u
}

function room(): Promise<Channel> {
  return server.createChannel(`Sala ${Math.random().toString(36).slice(2, 8)}`, 'voice')
}

async function joinAndShare(u: TestUser, channelId: string): Promise<void> {
  const res = await u.socket.emitWithAck('voice:join', { channelId, muted: false, deafened: false })
  if (!res.ok) throw new Error(res.error)
  const live = waitFor(u.socket, 'voice:state', (s) => s.some((v) => v.userId === u.socket.id && v.sharing))
  u.socket.emit('voice:sharing', true)
  await live
}

function previewOf(viewer: TestUser, sharer: TestUser): Promise<ScreenPreviewResult> {
  return viewer.socket.emitWithAck('voice:preview-get', sharer.socket.id ?? '')
}

async function waitForImage(viewer: TestUser, sharer: TestUser, image: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const res = await previewOf(viewer, sharer)
    if (res.ok && res.image === image) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error('a prévia não chegou')
}

async function denyEveryone(channelId: string, deny: ChannelPermission[]): Promise<void> {
  const o = await owner()
  const res = await o.socket.emitWithAck('channel:set-overrides', { channelId, overrides: [{ roleId: EVERYONE_ROLE_ID, allow: [], deny }] })
  if (!res.ok) throw new Error(res.error)
}

describe('prévia do "ao vivo"', () => {
  it('quem está fora da sala vê a miniatura mais recente de quem compartilha', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await room()
    await joinAndShare(ana, ch.id)
    expect(await previewOf(bia, ana)).toEqual({ ok: true, image: null })

    ana.socket.emit('voice:preview', IMAGE)
    await waitForImage(bia, ana, IMAGE)
    const newer = `${SCREEN_PREVIEW_PREFIX}BBBB`
    ana.socket.emit('voice:preview', newer)
    await waitForImage(bia, ana, newer)
  })

  it('ignora miniatura inválida, grande demais ou de quem não está compartilhando', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await room()
    const notSharing = await ana.socket.emitWithAck('voice:join', { channelId: ch.id, muted: false, deafened: false })
    expect(notSharing.ok).toBe(true)
    ana.socket.emit('voice:preview', IMAGE)
    await joinAndShare(ana, ch.id)

    const raw = ana.socket as unknown as { emit(e: string, p: unknown): void }
    raw.emit('voice:preview', 42)
    ana.socket.emit('voice:preview', 'data:text/html;base64,AAAA')
    ana.socket.emit('voice:preview', SCREEN_PREVIEW_PREFIX + 'A'.repeat(SCREEN_PREVIEW_MAX_CHARS))
    const marker = `${SCREEN_PREVIEW_PREFIX}OK`
    ana.socket.emit('voice:preview', marker)
    await waitForImage(bia, ana, marker)
  })

  it('parar de compartilhar apaga a miniatura; sair da sala deixa a prévia indisponível', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await room()
    await joinAndShare(ana, ch.id)
    ana.socket.emit('voice:preview', IMAGE)
    await waitForImage(bia, ana, IMAGE)

    const stopped = waitFor(bia.socket, 'voice:state', (s) => s.some((v) => v.userId === ana.socket.id && !v.sharing))
    ana.socket.emit('voice:sharing', false)
    await stopped
    expect(await previewOf(bia, ana)).toEqual({ ok: false, error: 'Prévia indisponível' })
    const again = waitFor(bia.socket, 'voice:state', (s) => s.some((v) => v.userId === ana.socket.id && v.sharing))
    ana.socket.emit('voice:sharing', true)
    await again
    expect(await previewOf(bia, ana)).toEqual({ ok: true, image: null })

    const left = waitFor(bia.socket, 'voice:state', (s) => !s.some((v) => v.userId === ana.socket.id))
    ana.socket.emit('voice:leave')
    await left
    expect(await previewOf(bia, ana)).toEqual({ ok: false, error: 'Prévia indisponível' })
  })

  it('recusa conexão inexistente e id inválido', async () => {
    const bia = await user('Bia')
    expect(await bia.socket.emitWithAck('voice:preview-get', 'ninguem')).toEqual({ ok: false, error: 'Prévia indisponível' })
    const raw = bia.socket as unknown as { emitWithAck(e: string, p: unknown): Promise<unknown> }
    expect(await raw.emitWithAck('voice:preview-get', { id: 1 })).toEqual({ ok: false, error: 'Prévia indisponível' })
  })

  it.each<[string, ChannelPermission[]]>([
    ['sem ver a sala', ['view']],
    ['sem poder entrar na sala', ['connect']]
  ])('%s, a prévia fica indisponível', async (_caso, deny) => {
    const dona = await owner()
    const bia = await user('Bia')
    const ch = await room()
    await joinAndShare(dona, ch.id)
    dona.socket.emit('voice:preview', IMAGE)
    await waitForImage(dona, dona, IMAGE)
    await denyEveryone(ch.id, deny)
    expect(await previewOf(bia, dona)).toEqual({ ok: false, error: 'Prévia indisponível' })
  })
})
