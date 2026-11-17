import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, MUSIC_QUEUE_MAX, type MusicResult, type MusicState } from '../../src/shared/types'
import { FakeLiveKit, liveKitEnv } from './fake-livekit'
import { expectNoEvent, sleep, TestServer, waitFor, type TestUser } from './helpers'

const LONG = 'L'.repeat(22)
const LONG_2 = 'M'.repeat(22)
const SHORT = 'S'.repeat(22)
const TOO_LONG = 'T'.repeat(22)
const MISSING = 'N'.repeat(22)

const TRACKS: Record<string, { name: string; duration_ms: number }> = {
  [LONG]: { name: 'Faixa longa', duration_ms: 9 * 60_000 },
  [LONG_2]: { name: 'Outra longa', duration_ms: 9 * 60_000 },
  [SHORT]: { name: 'Vinheta', duration_ms: 30_000 },
  [TOO_LONG]: { name: 'Sinfonia inteira', duration_ms: 20 * 60_000 }
}

const link = (id: string): string => `https://open.spotify.com/intl-pt/track/${id}?si=abc`

function startFakeSpotify(): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    const send = (status: number, body: unknown): void => void res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    if (req.method === 'POST' && path === '/api/token') return send(200, { access_token: 'tok', expires_in: 3600 })
    const track = TRACKS[path.replace('/v1/tracks/', '')]
    if (!track || req.headers.authorization !== 'Bearer tok') return send(404, { error: { status: 404 } })
    send(200, {
      ...track,
      artists: [{ name: 'Banda Teste' }],
      album: { images: [{ url: 'https://i.scdn.co/capa.jpg' }] },
      external_urls: { spotify: `https://open.spotify.com/track/${path.split('/').pop()}` }
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server })))
}

function playing(res: MusicResult): MusicState {
  if (!res.ok) throw new Error(res.error)
  return res.state
}

async function waitLog(server: TestServer, text: string, times = 1): Promise<void> {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    if (server.log.split(text).length - 1 >= times) return
    await sleep(25)
  }
  throw new Error(`o log não mostrou "${text}" ${times}x:\n${server.log}`)
}

describe('bot de música sem configuração', () => {
  let server: TestServer
  beforeAll(async () => {
    server = await TestServer.start({ env: { SPOTIFY_CLIENT_ID: '', SPOTIFY_CLIENT_SECRET: '' } })
  })
  afterAll(() => server.destroy())

  it('sem SPOTIFY_CLIENT_ID/SECRET: "Bot de música não configurado"', async () => {
    const owner = await server.asOwner()
    const res = await owner.socket.emitWithAck('music:play', { channelId: 'qualquer', url: link(LONG) })
    expect(res).toEqual({ ok: false, error: expect.stringContaining('Bot de música não configurado') })
  })
})

describe('bot de música', () => {
  const livekit = new FakeLiveKit()
  let spotify: { url: string; server: Server }
  let server: TestServer
  let ana: TestUser
  let bia: TestUser

  const join = async (u: TestUser, channelId: string): Promise<void> => {
    const res = await u.socket.emitWithAck('voice:join', { channelId, muted: false, deafened: false })
    if (!res.ok) throw new Error(res.error)
  }
  const room = async (): Promise<string> => (await server.createChannel(`sala-${Math.random().toString(36).slice(2, 7)}`, 'voice')).id

  beforeAll(async () => {
    spotify = await startFakeSpotify()
    server = await TestServer.start({
      env: {
        ...liveKitEnv(await livekit.start()),
        SPOTIFY_CLIENT_ID: 'id',
        SPOTIFY_CLIENT_SECRET: 'segredo',
        SPOTIFY_ACCOUNTS_URL: spotify.url,
        SPOTIFY_API_URL: spotify.url
      },
      imports: ['./server/tests/fake-music-playback.ts']
    })
    ana = await server.newUser('Ana')
    bia = await server.newUser('Bia')
  })

  afterAll(async () => {
    ana?.socket.close()
    bia?.socket.close()
    await server?.destroy()
    await livekit.stop()
    await new Promise((r) => spotify.server.close(r))
  })

  it('quem não está na sala não pede música', async () => {
    const id = await room()
    const res = await ana.socket.emitWithAck('music:play', { channelId: id, url: link(LONG) })
    expect(res).toEqual({ ok: false, error: 'Entre na sala de voz para controlar a música' })
  })

  it('recusa link de outro domínio, faixa inexistente e faixa longa demais', async () => {
    const id = await room()
    await join(ana, id)
    const play = (url: string): Promise<MusicResult> => ana.socket.emitWithAck('music:play', { channelId: id, url })
    expect(await play('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      ok: false,
      error: 'Envie um link de música do Spotify (open.spotify.com/track/...)'
    })
    expect(await play(link(MISSING))).toEqual({ ok: false, error: 'Música não encontrada no Spotify' })
    expect(await play(link(TOO_LONG))).toEqual({ ok: false, error: 'Música longa demais (máximo de 15 min)' })
    expect(await play('x'.repeat(600))).toEqual({ ok: false, error: 'Envie um link de música do Spotify' })
    expect(playing(await ana.socket.emitWithAck('music:queue', id)).nowPlaying).toBeNull()
  })

  it('tocar, enfileirar, pular e parar; quem vê a sala recebe music:state', async () => {
    const id = await room()
    await join(ana, id)
    const seen = waitFor(bia.socket, 'music:state', (s) => s.channelId === id && s.nowPlaying?.title === 'Faixa longa')
    const first = playing(await ana.socket.emitWithAck('music:play', { channelId: id, url: link(LONG) }))
    expect(first.nowPlaying).toMatchObject({
      title: 'Faixa longa',
      artists: ['Banda Teste'],
      coverUrl: 'https://i.scdn.co/capa.jpg',
      durationMs: 9 * 60_000,
      requestedBy: { accountId: ana.self.accountId, name: 'Ana' }
    })
    await seen
    await waitLog(server, `[fake-music] join ${id}`)

    const second = playing(await ana.socket.emitWithAck('music:play', { channelId: id, url: `spotify:track:${LONG_2}` }))
    expect(second.queue.map((t) => t.title)).toEqual(['Outra longa'])

    const skipped = playing(await ana.socket.emitWithAck('music:skip', id))
    expect(skipped.nowPlaying?.title).toBe('Outra longa')
    expect(skipped.queue).toEqual([])

    expect(await bia.socket.emitWithAck('music:skip', id)).toEqual({ ok: false, error: 'Entre na sala de voz para controlar a música' })

    const stopped = playing(await ana.socket.emitWithAck('music:stop', id))
    expect(stopped).toEqual({ channelId: id, nowPlaying: null, queue: [] })
    await waitLog(server, `[fake-music] leave ${id}`)
    expect(await ana.socket.emitWithAck('music:skip', id)).toEqual({ ok: false, error: 'Nenhuma música tocando' })
  })

  it('a fila acaba: o bot sai sozinho', async () => {
    const id = await room()
    await join(ana, id)
    const ended = waitFor(ana.socket, 'music:state', (s) => s.channelId === id && s.nowPlaying === null)
    playing(await ana.socket.emitWithAck('music:play', { channelId: id, url: link(SHORT) }))
    await ended
    await waitLog(server, `[fake-music] leave ${id}`)
  })

  it('a sala esvazia: o bot sai e a fila zera', async () => {
    const id = await room()
    await join(ana, id)
    playing(await ana.socket.emitWithAck('music:play', { channelId: id, url: link(LONG) }))
    const ended = waitFor(ana.socket, 'music:state', (s) => s.channelId === id && s.nowPlaying === null)
    ana.socket.emit('voice:leave')
    await ended
    await waitLog(server, `[fake-music] leave ${id}`)
  })

  it(`fila cheia: no máximo ${MUSIC_QUEUE_MAX} músicas esperando`, async () => {
    const id = await room()
    await join(ana, id)
    for (let i = 0; i <= MUSIC_QUEUE_MAX; i++) playing(await ana.socket.emitWithAck('music:play', { channelId: id, url: link(LONG) }))
    expect(await ana.socket.emitWithAck('music:play', { channelId: id, url: link(LONG) })).toEqual({
      ok: false,
      error: `A fila está cheia (máximo de ${MUSIC_QUEUE_MAX} músicas)`
    })
    await ana.socket.emitWithAck('music:stop', id)
  })

  it('sala privada: quem não vê o canal não recebe o estado', async () => {
    const owner = await server.asOwner()
    const id = await room()
    const set = await owner.socket.emitWithAck('channel:set-overrides', {
      channelId: id,
      overrides: [{ roleId: EVERYONE_ROLE_ID, allow: [], deny: ['view'] }]
    })
    expect(set.ok).toBe(true)
    await join(owner, id)
    const hidden = expectNoEvent(bia.socket, 'music:state', (s) => s.channelId === id)
    playing(await owner.socket.emitWithAck('music:play', { channelId: id, url: link(LONG) }))
    await hidden
    expect(await bia.socket.emitWithAck('music:queue', id)).toEqual({ ok: false, error: 'Canal de voz não encontrado' })
    await owner.socket.emitWithAck('music:stop', id)
  })
})
