import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, MUSIC_QUEUE_MAX, type MusicPlayResult, type MusicResult, type MusicState } from '../../src/shared/types'
import { FakeLiveKit, liveKitEnv } from './fake-livekit'
import { FAKE_YOUTUBE } from './fake-youtube'
import { expectNoEvent, sleep, TestServer, waitFor, type TestUser } from './helpers'

const LONG = 'L'.repeat(22)
const LONG_2 = 'M'.repeat(22)
const SHORT = 'S'.repeat(22)
const TOO_LONG = 'T'.repeat(22)
const MISSING = 'N'.repeat(22)
const PLAYLIST = 'P'.repeat(22)

const INVALID = 'Envie o nome da música ou um link do Spotify ou do YouTube'

const TRACKS: Record<string, { name: string; duration_ms: number }> = {
  [LONG]: { name: 'Faixa longa', duration_ms: 9 * 60_000 },
  [LONG_2]: { name: 'Outra longa', duration_ms: 9 * 60_000 },
  [SHORT]: { name: 'Vinheta', duration_ms: 30_000 },
  [TOO_LONG]: { name: 'Sinfonia inteira', duration_ms: 20 * 60_000 }
}

const EMBED_PLAYLIST = {
  coverArt: { sources: [{ url: 'https://image-cdn.spotifycdn.com/capa-playlist' }] },
  trackList: [
    { uri: `spotify:track:${'A'.repeat(22)}`, title: 'Chega de Saudade', subtitle: 'João Gilberto', duration: 9 * 60_000, entityType: 'track' },
    { uri: `spotify:episode:${'E'.repeat(22)}`, title: 'Um podcast', subtitle: 'Alguém', duration: 60_000, entityType: 'episode' },
    { uri: `spotify:track:${'B'.repeat(22)}`, title: 'Desafinado', subtitle: 'João Gilberto', duration: 9 * 60_000, entityType: 'track' }
  ]
}

const link = (id: string): string => `https://open.spotify.com/intl-pt/track/${id}?si=abc`
const watch = (id: string): string => `https://youtu.be/${id}`
const youtubePlaylist = (id: string): string => `https://www.youtube.com/playlist?list=${id}`

function startFakeSpotify(): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    const send = (status: number, body: unknown): void => void res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    if (req.method === 'POST' && path === '/api/token') return send(200, { access_token: 'tok', expires_in: 3600 })
    if (path === `/embed/playlist/${PLAYLIST}`) {
      const data = JSON.stringify({ props: { pageProps: { state: { data: { entity: EMBED_PLAYLIST } } } } })
      return void res.writeHead(200, { 'content-type': 'text/html' }).end(`<script id="__NEXT_DATA__" type="application/json">${data}</script>`)
    }
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

function playing(res: MusicResult | MusicPlayResult): MusicState {
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
    server = await TestServer.start({ env: { LIVEKIT_URL: '', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '' } })
  })
  afterAll(() => server.destroy())

  it('sem LiveKit: "Bot de música não configurado"', async () => {
    const owner = await server.asOwner()
    const res = await owner.socket.emitWithAck('music:play', { channelId: 'qualquer', query: link(LONG) })
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
  const play = (u: TestUser, channelId: string, query: string): Promise<MusicPlayResult> => u.socket.emitWithAck('music:play', { channelId, query })
  const roomWithAna = async (): Promise<string> => {
    const id = await room()
    await join(ana, id)
    return id
  }

  beforeAll(async () => {
    spotify = await startFakeSpotify()
    server = await TestServer.start({
      env: {
        ...liveKitEnv(await livekit.start()),
        SPOTIFY_CLIENT_ID: 'id',
        SPOTIFY_CLIENT_SECRET: 'segredo',
        SPOTIFY_ACCOUNTS_URL: spotify.url,
        SPOTIFY_API_URL: spotify.url,
        SPOTIFY_EMBED_URL: spotify.url
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
    expect(await play(ana, id, link(LONG))).toEqual({ ok: false, error: 'Entre na sala de voz para controlar a música' })
  })

  it('recusa link de outro site, faixa inexistente, faixa longa demais e pedido grande demais', async () => {
    const id = await roomWithAna()
    expect(await play(ana, id, 'https://soundcloud.com/artista/musica')).toEqual({ ok: false, error: INVALID })
    expect(await play(ana, id, link(MISSING))).toEqual({ ok: false, error: 'Música não encontrada no Spotify' })
    expect(await play(ana, id, link(TOO_LONG))).toEqual({ ok: false, error: 'Música longa demais (máximo de 15 min)' })
    expect(await play(ana, id, 'x'.repeat(600))).toEqual({ ok: false, error: INVALID })
    expect(await play(ana, id, '   ')).toEqual({ ok: false, error: INVALID })
    expect(playing(await ana.socket.emitWithAck('music:queue', id)).nowPlaying).toBeNull()
  })

  it('tocar, enfileirar, pular e parar; quem vê a sala recebe music:state', async () => {
    const id = await roomWithAna()
    const seen = waitFor(bia.socket, 'music:state', (s) => s.channelId === id && s.nowPlaying?.title === 'Faixa longa')
    const first = await play(ana, id, link(LONG))
    expect(first.ok && first.added).toBe(1)
    expect(playing(first).nowPlaying).toMatchObject({
      title: 'Faixa longa',
      artists: ['Banda Teste'],
      coverUrl: 'https://i.scdn.co/capa.jpg',
      durationMs: 9 * 60_000,
      requestedBy: { accountId: ana.self.accountId, name: 'Ana' }
    })
    expect(playing(first).nowPlaying).not.toHaveProperty('audio')
    await seen
    await waitLog(server, `[fake-music] join ${id}`)

    const second = playing(await play(ana, id, `spotify:track:${LONG_2}`))
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

  it('playlist do Spotify: enfileira as faixas (sem episódios) e diz quantas entraram', async () => {
    const id = await roomWithAna()
    const res = await play(ana, id, `https://open.spotify.com/playlist/${PLAYLIST}?si=x`)
    expect(res.ok && res.added).toBe(2)
    const state = playing(res)
    expect([state.nowPlaying?.title, ...state.queue.map((t) => t.title)]).toEqual(['Chega de Saudade', 'Desafinado'])
    expect(state.nowPlaying).toMatchObject({ artists: ['João Gilberto'], coverUrl: 'https://image-cdn.spotifycdn.com/capa-playlist' })
    await ana.socket.emitWithAck('music:stop', id)
  })

  it('vídeo do YouTube: toca o próprio vídeo; ao vivo e longo demais são recusados', async () => {
    const id = await roomWithAna()
    expect(await play(ana, id, watch(FAKE_YOUTUBE.live))).toEqual({ ok: false, error: 'Transmissões ao vivo não podem ser tocadas' })
    expect(await play(ana, id, watch(FAKE_YOUTUBE.long))).toEqual({ ok: false, error: 'Música longa demais (máximo de 15 min)' })
    const res = await play(ana, id, `https://www.youtube.com/watch?v=${FAKE_YOUTUBE.video}&list=PLqualquer`)
    expect(playing(res).nowPlaying).toMatchObject({
      title: 'Vídeo do YouTube',
      artists: ['Canal Teste'],
      durationMs: 180_000,
      url: `https://www.youtube.com/watch?v=${FAKE_YOUTUBE.video}`
    })
    await ana.socket.emitWithAck('music:stop', id)
  })

  it('playlist do YouTube: pula vídeo privado e longo demais', async () => {
    const id = await roomWithAna()
    const res = await play(ana, id, youtubePlaylist(FAKE_YOUTUBE.playlist))
    expect(res.ok && res.added).toBe(3)
    const state = playing(res)
    expect([state.nowPlaying?.title, ...state.queue.map((t) => t.title)]).toEqual(['Primeira', 'Segunda', 'Terceira'])
    await ana.socket.emitWithAck('music:stop', id)
  })

  it('texto livre: busca no YouTube e mostra o que achou antes de tocar', async () => {
    const id = await roomWithAna()
    const res = await play(ana, id, `  ${FAKE_YOUTUBE.search}  `)
    expect(playing(res).nowPlaying).toMatchObject({ title: 'Garota de Ipanema (ao vivo no estúdio)', durationMs: 240_000 })
    expect(await play(ana, id, FAKE_YOUTUBE.nothing)).toEqual({ ok: false, error: `Nada encontrado no YouTube para "${FAKE_YOUTUBE.nothing}"` })
    await ana.socket.emitWithAck('music:stop', id)
  })

  it('a fila acaba: o bot sai sozinho', async () => {
    const id = await roomWithAna()
    const ended = waitFor(ana.socket, 'music:state', (s) => s.channelId === id && s.nowPlaying === null)
    playing(await play(ana, id, link(SHORT)))
    await ended
    await waitLog(server, `[fake-music] leave ${id}`)
  })

  it('a sala esvazia: o bot sai e a fila zera', async () => {
    const id = await roomWithAna()
    playing(await play(ana, id, link(LONG)))
    const ended = waitFor(ana.socket, 'music:state', (s) => s.channelId === id && s.nowPlaying === null)
    ana.socket.emit('voice:leave')
    await ended
    await waitLog(server, `[fake-music] leave ${id}`)
  })

  it(`playlist maior que a fila: entra até encher (${MUSIC_QUEUE_MAX} esperando); fila cheia recusa`, async () => {
    const id = await roomWithAna()
    playing(await play(ana, id, link(LONG)))
    playing(await play(ana, id, link(LONG_2)))
    const res = await play(ana, id, youtubePlaylist(FAKE_YOUTUBE.bigPlaylist))
    expect(res.ok && res.added).toBe(MUSIC_QUEUE_MAX - 1)
    expect(playing(res).queue).toHaveLength(MUSIC_QUEUE_MAX)
    const full = { ok: false, error: `A fila está cheia (máximo de ${MUSIC_QUEUE_MAX} músicas)` }
    expect(await play(ana, id, link(LONG))).toEqual(full)
    expect(await play(ana, id, youtubePlaylist(FAKE_YOUTUBE.bigPlaylist))).toEqual(full)
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
    playing(await play(owner, id, link(LONG)))
    await hidden
    expect(await bia.socket.emitWithAck('music:queue', id)).toEqual({ ok: false, error: 'Canal de voz não encontrado' })
    await owner.socket.emitWithAck('music:stop', id)
  })
})
