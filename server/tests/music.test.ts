import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, MUSIC_QUEUE_MAX, type Message, type MessageEdited, type MusicPlayResult, type MusicResult, type MusicState, type ChannelPermission } from '../../src/shared/types'
import { FakeLiveKit, liveKitEnv } from './fake-livekit'
import { FAKE_YOUTUBE } from './fake-youtube'
import { expectNoEvent, sleep, TestServer, waitFor, type TestUser } from './helpers'

const LONG = 'L'.repeat(22)
const LONG_2 = 'M'.repeat(22)
const SHORT = 'S'.repeat(22)
const TOO_LONG = 'T'.repeat(22)
const MISSING = 'N'.repeat(22)
const PLAYLIST = 'P'.repeat(22)
const HELD = 'H'.repeat(22)
const HELD_2 = 'J'.repeat(22)
const ALBUM = 'D'.repeat(22)

const INVALID = 'Envie o nome da música ou um link do Spotify ou do YouTube'

const TRACKS: Record<string, { name: string; duration_ms: number }> = {
  [LONG]: { name: 'Faixa longa', duration_ms: 9 * 60_000 },
  [LONG_2]: { name: 'Outra longa', duration_ms: 9 * 60_000 },
  [SHORT]: { name: 'Vinheta', duration_ms: 30_000 },
  [TOO_LONG]: { name: 'Sinfonia inteira', duration_ms: 20 * 60_000 },
  [HELD]: { name: 'Faixa segurada', duration_ms: 9 * 60_000 },
  [HELD_2]: { name: 'Outra segurada', duration_ms: 9 * 60_000 }
}
const HELD_TRACKS = new Set([HELD, HELD_2])

const EMBED_PLAYLIST = {
  name: 'Bossa do grupo',
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

interface FakeSpotify {
  url: string
  server: Server
  held: () => number
  release: () => void
}

function startFakeSpotify(): Promise<FakeSpotify> {
  const waiting: (() => void)[] = []
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    const send = (status: number, body: unknown): void => void res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    if (req.method === 'POST' && path === '/api/token') return send(200, { access_token: 'tok', expires_in: 3600 })
    if (path === `/embed/playlist/${PLAYLIST}`) {
      const data = JSON.stringify({ props: { pageProps: { state: { data: { entity: EMBED_PLAYLIST } } } } })
      return void res.writeHead(200, { 'content-type': 'text/html' }).end(`<script id="__NEXT_DATA__" type="application/json">${data}</script>`)
    }
    if (path === `/v1/albums/${ALBUM}` && req.headers.authorization === 'Bearer tok') {
      const item = { name: 'Faixa do disco', duration_ms: 60_000, artists: [{ name: 'Banda Teste' }], id: 'a1' }
      return send(200, { name: 'Disco de teste', images: [], tracks: { items: [item], total: 1, limit: 50 } })
    }
    const trackId = path.replace('/v1/tracks/', '')
    const track = TRACKS[trackId]
    if (!track || req.headers.authorization !== 'Bearer tok') return send(404, { error: { status: 404 } })
    const answer = (): void =>
      send(200, {
        ...track,
        artists: [{ name: 'Banda Teste' }],
        album: { images: [{ url: 'https://i.scdn.co/capa.jpg' }] },
        external_urls: { spotify: `https://open.spotify.com/track/${trackId}` }
      })
    if (HELD_TRACKS.has(trackId)) waiting.push(answer)
    else answer()
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        server,
        held: () => waiting.length,
        release: () => waiting.splice(0).forEach((answer) => answer())
      })
    )
  )
}

function playing(res: MusicResult | MusicPlayResult): MusicState {
  if (!res.ok) throw new Error(res.error)
  return res.state
}

async function until(check: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    if (check()) return
    await sleep(25)
  }
  throw new Error(`não aconteceu: ${what}`)
}

function chatOf(user: TestUser, channelId: string): Message[] {
  const seen: Message[] = []
  user.socket.on('message:new', (m) => {
    if (m.channelId === channelId) seen.push(m)
  })
  user.socket.on('message:edited', (edit) => {
    const i = seen.findIndex((m) => m.id === edit.messageId)
    if (i >= 0 && 'tool' in edit) seen[i] = { ...seen[i], content: edit.content, tool: edit.tool }
  })
  return seen
}

function editsOf(user: TestUser, channelId: string): MessageEdited[] {
  const edits: MessageEdited[] = []
  user.socket.on('message:edited', (edit) => {
    if (edit.channelId === channelId) edits.push(edit)
  })
  return edits
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
  let spotify: FakeSpotify
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

    const skipped = playing(await ana.socket.emitWithAck('music:skip', { channelId: id }))
    expect(skipped.nowPlaying?.title).toBe('Outra longa')
    expect(skipped.queue).toEqual([])

    expect(await bia.socket.emitWithAck('music:skip', { channelId: id })).toEqual({ ok: false, error: 'Entre na sala de voz para controlar a música' })

    const stopped = playing(await ana.socket.emitWithAck('music:stop', { channelId: id }))
    expect(stopped).toEqual({ channelId: id, nowPlaying: null, queue: [], paused: false, elapsedMs: 0 })
    await waitLog(server, `[fake-music] leave ${id}`)
    expect(await ana.socket.emitWithAck('music:skip', { channelId: id })).toEqual({ ok: false, error: 'Nenhuma música tocando' })
  })

  it('playlist do Spotify: enfileira as faixas (sem episódios) e diz quantas entraram', async () => {
    const id = await roomWithAna()
    const res = await play(ana, id, `https://open.spotify.com/playlist/${PLAYLIST}?si=x`)
    expect(res.ok && res.added).toBe(2)
    const state = playing(res)
    expect([state.nowPlaying?.title, ...state.queue.map((t) => t.title)]).toEqual(['Chega de Saudade', 'Desafinado'])
    expect(state.nowPlaying).toMatchObject({ artists: ['João Gilberto'], coverUrl: 'https://image-cdn.spotifycdn.com/capa-playlist' })
    await ana.socket.emitWithAck('music:stop', { channelId: id })
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
    await ana.socket.emitWithAck('music:stop', { channelId: id })
  })

  it('playlist do YouTube: pula vídeo privado e longo demais', async () => {
    const id = await roomWithAna()
    const res = await play(ana, id, youtubePlaylist(FAKE_YOUTUBE.playlist))
    expect(res.ok && res.added).toBe(3)
    const state = playing(res)
    expect([state.nowPlaying?.title, ...state.queue.map((t) => t.title)]).toEqual(['Primeira', 'Segunda', 'Terceira'])
    await ana.socket.emitWithAck('music:stop', { channelId: id })
  })

  it('texto livre: busca no YouTube e mostra o que achou antes de tocar', async () => {
    const id = await roomWithAna()
    const res = await play(ana, id, `  ${FAKE_YOUTUBE.search}  `)
    expect(playing(res).nowPlaying).toMatchObject({ title: 'Garota de Ipanema (ao vivo no estúdio)', durationMs: 240_000 })
    expect(await play(ana, id, FAKE_YOUTUBE.nothing)).toEqual({ ok: false, error: `Nada encontrado no YouTube para "${FAKE_YOUTUBE.nothing}"` })
    await ana.socket.emitWithAck('music:stop', { channelId: id })
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
    await ana.socket.emitWithAck('music:stop', { channelId: id })
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
    await owner.socket.emitWithAck('music:stop', { channelId: id })
  })

  describe('pausar e continuar', () => {
    const pause = (u: TestUser, channelId: string): Promise<MusicResult> => u.socket.emitWithAck('music:pause', { channelId })
    const resume = (u: TestUser, channelId: string): Promise<MusicResult> => u.socket.emitWithAck('music:resume', { channelId })

    it('pausa a sala toda: o estado vai para quem vê, com paused; continuar volta', async () => {
      const id = await roomWithAna()
      playing(await play(ana, id, link(LONG)))
      const paused = waitFor(bia.socket, 'music:state', (s) => s.channelId === id && s.paused)
      expect(playing(await pause(ana, id))).toMatchObject({ paused: true, nowPlaying: { title: 'Faixa longa' } })
      expect((await paused)[0]).toMatchObject({ paused: true })
      const resumed = waitFor(bia.socket, 'music:state', (s) => s.channelId === id && !s.paused)
      expect(playing(await resume(ana, id)).paused).toBe(false)
      await resumed
      await ana.socket.emitWithAck('music:stop', { channelId: id })
    })

    it('quem está fora da sala não pausa nem continua', async () => {
      const id = await roomWithAna()
      playing(await play(ana, id, link(LONG)))
      const denied = { ok: false, error: 'Entre na sala de voz para controlar a música' }
      expect(await pause(bia, id)).toEqual(denied)
      expect(await resume(bia, id)).toEqual(denied)
      expect(playing(await ana.socket.emitWithAck('music:queue', id)).paused).toBe(false)
      await ana.socket.emitWithAck('music:stop', { channelId: id })
    })

    it('sem música tocando: erro em português', async () => {
      const id = await roomWithAna()
      expect(await pause(ana, id)).toEqual({ ok: false, error: 'Nenhuma música tocando' })
      expect(await resume(ana, id)).toEqual({ ok: false, error: 'Nenhuma música tocando' })
    })

    it('pular pausado mantém a pausa; parar limpa', async () => {
      const id = await roomWithAna()
      playing(await play(ana, id, link(LONG)))
      playing(await play(ana, id, link(LONG_2)))
      playing(await pause(ana, id))
      const skipped = playing(await ana.socket.emitWithAck('music:skip', { channelId: id }))
      expect(skipped).toMatchObject({ nowPlaying: { title: 'Outra longa' }, paused: true, elapsedMs: 0 })
      expect(playing(await ana.socket.emitWithAck('music:stop', { channelId: id })).paused).toBe(false)
    })

    it('elapsedMs conta o tempo tocado e para de contar na pausa', async () => {
      const id = await roomWithAna()
      playing(await play(ana, id, link(LONG)))
      await until(() => server.log.includes(`[fake-music] join ${id}`), 'bot entrou')
      await sleep(150)
      const paused = playing(await pause(ana, id))
      expect(paused.elapsedMs).toBeGreaterThan(0)
      await sleep(100)
      expect(playing(await ana.socket.emitWithAck('music:queue', id)).elapsedMs).toBe(paused.elapsedMs)
      await ana.socket.emitWithAck('music:stop', { channelId: id })
    })
  })

  describe('pular para uma da fila e embaralhar', () => {
    const fill = async (): Promise<string> => {
      const id = await roomWithAna()
      playing(await play(ana, id, link(LONG)))
      playing(await play(ana, id, link(LONG_2)))
      playing(await play(ana, id, `https://open.spotify.com/playlist/${PLAYLIST}`))
      return id
    }
    const jump = (u: TestUser, channelId: string, trackId: unknown): Promise<MusicResult> => u.socket.emitWithAck('music:jump', { channelId, trackId } as never)
    const shuffle = (u: TestUser, channelId: string, textChannelId?: string): Promise<MusicResult> =>
      u.socket.emitWithAck('music:shuffle', { channelId, ...(textChannelId ? { textChannelId } : {}) })

    it('pular para a 3ª da fila: ela toca e as anteriores saem; quem vê a sala recebe o estado', async () => {
      const id = await fill()
      const queue = playing(await ana.socket.emitWithAck('music:queue', id)).queue
      expect(queue.map((t) => t.title)).toEqual(['Outra longa', 'Chega de Saudade', 'Desafinado'])
      const seen = waitFor(bia.socket, 'music:state', (s) => s.channelId === id && s.nowPlaying?.title === 'Desafinado')
      const jumped = playing(await jump(ana, id, queue[2].id))
      expect(jumped.nowPlaying?.title).toBe('Desafinado')
      expect(jumped.queue).toEqual([])
      await seen
      await ana.socket.emitWithAck('music:stop', { channelId: id })
    })

    it('pular recusa id fora da fila, id inválido, quem está fora da sala e sala sem música', async () => {
      const id = await fill()
      const { nowPlaying, queue } = playing(await ana.socket.emitWithAck('music:queue', id))
      const gone = { ok: false, error: 'Essa música não está mais na fila' }
      expect(await jump(ana, id, nowPlaying!.id)).toEqual(gone)
      expect(await jump(ana, id, 'x'.repeat(2000))).toEqual(gone)
      expect(await jump(ana, id, 42)).toEqual(gone)
      expect(await jump(bia, id, queue[0].id)).toEqual({ ok: false, error: 'Entre na sala de voz para controlar a música' })
      expect(playing(await ana.socket.emitWithAck('music:queue', id)).queue).toEqual(queue)
      await ana.socket.emitWithAck('music:stop', { channelId: id })
      expect(await jump(ana, id, queue[0].id)).toEqual({ ok: false, error: 'Nenhuma música tocando' })
    })

    it('embaralhar mexe só na fila: a que toca segue e as mesmas músicas continuam', async () => {
      const id = await fill()
      const before = playing(await ana.socket.emitWithAck('music:queue', id))
      const after = playing(await shuffle(ana, id))
      expect(after.nowPlaying).toEqual(before.nowPlaying)
      expect(after.queue.map((t) => t.id).sort()).toEqual(before.queue.map((t) => t.id).sort())
      await ana.socket.emitWithAck('music:stop', { channelId: id })
    })

    it('embaralhar recusa fila com menos de 2, sala sem música e quem está fora da sala', async () => {
      const id = await roomWithAna()
      expect(await shuffle(ana, id)).toEqual({ ok: false, error: 'Nenhuma música tocando' })
      playing(await play(ana, id, link(LONG)))
      playing(await play(ana, id, link(LONG_2)))
      expect(await shuffle(ana, id)).toEqual({ ok: false, error: 'Precisa de pelo menos 2 músicas na fila para embaralhar' })
      expect(await shuffle(bia, id)).toEqual({ ok: false, error: 'Entre na sala de voz para controlar a música' })
      await ana.socket.emitWithAck('music:stop', { channelId: id })
    })

    it('/shuffle no chat: o comando e a resposta do bot; o botão (sem canal de texto) não posta', async () => {
      const id = await fill()
      const chat = (await server.createChannel(`chat-${Math.random().toString(36).slice(2, 7)}`)).id
      const seen = chatOf(bia, chat)
      playing(await shuffle(ana, id, chat))
      await until(() => seen.length === 2, 'comando e resposta')
      expect(seen.map((m) => [m.kind ?? 'text', m.content])).toEqual([
        ['text', '/shuffle'],
        ['tool', 'Embaralhou a fila (3 músicas)']
      ])
      expect(seen[1].tool).toEqual({ tool: 'music', result: { action: 'shuffle', count: 3 } })
      const silent = expectNoEvent(ana.socket, 'message:new', (m) => m.channelId === id)
      playing(await shuffle(ana, id))
      await silent
      await ana.socket.emitWithAck('music:stop', { channelId: id })
    })
  })

  describe('coleção no resultado do play', () => {
    it('playlist e álbum do Spotify e playlist do YouTube trazem tipo, título e link', async () => {
      const id = await roomWithAna()
      const playlist = await play(ana, id, `https://open.spotify.com/intl-pt/playlist/${PLAYLIST}?si=x`)
      expect(playlist.ok && playlist.collection).toEqual({ kind: 'playlist', title: 'Bossa do grupo', url: `https://open.spotify.com/playlist/${PLAYLIST}` })
      const album = await play(ana, id, `spotify:album:${ALBUM}`)
      expect(album.ok && album.collection).toEqual({ kind: 'album', title: 'Disco de teste', url: `https://open.spotify.com/album/${ALBUM}` })
      const youtube = await play(ana, id, youtubePlaylist(FAKE_YOUTUBE.playlist))
      expect(youtube.ok && youtube.collection).toEqual({ kind: 'playlist', title: 'Playlist do YouTube', url: youtubePlaylist(FAKE_YOUTUBE.playlist) })
      await ana.socket.emitWithAck('music:stop', { channelId: id })
    })

    it('faixa, vídeo e busca: collection nula', async () => {
      const id = await roomWithAna()
      for (const query of [link(LONG), watch(FAKE_YOUTUBE.video), FAKE_YOUTUBE.search]) {
        const res = await play(ana, id, query)
        expect(res.ok && res.collection).toBeNull()
      }
      await ana.socket.emitWithAck('music:stop', { channelId: id })
    })
  })

  describe('várias salas ao mesmo tempo', () => {
    const queueOf = async (u: TestUser, channelId: string): Promise<(string | undefined)[]> => {
      const state = playing(await u.socket.emitWithAck('music:queue', channelId))
      return [state.nowPlaying?.title, ...state.queue.map((t) => t.title)]
    }
    const roomWith = async (u: TestUser): Promise<string> => {
      const id = await room()
      await join(u, id)
      return id
    }

    it('cada sala tem a sua fila e o seu bot; pular e parar numa não mexe na outra', async () => {
      const salaA = await roomWith(ana)
      const salaB = await roomWith(bia)
      playing(await play(ana, salaA, link(LONG)))
      playing(await play(bia, salaB, link(LONG_2)))
      playing(await play(ana, salaA, link(LONG_2)))
      playing(await play(bia, salaB, link(LONG)))
      await waitLog(server, `[fake-music] join ${salaA}`)
      await waitLog(server, `[fake-music] join ${salaB}`)
      expect(await queueOf(ana, salaA)).toEqual(['Faixa longa', 'Outra longa'])
      expect(await queueOf(ana, salaB)).toEqual(['Outra longa', 'Faixa longa'])

      expect(await ana.socket.emitWithAck('music:skip', { channelId: salaB })).toEqual({ ok: false, error: 'Entre na sala de voz para controlar a música' })
      expect(playing(await ana.socket.emitWithAck('music:skip', { channelId: salaA })).nowPlaying?.title).toBe('Outra longa')
      expect(await queueOf(bia, salaB)).toEqual(['Outra longa', 'Faixa longa'])

      expect(playing(await bia.socket.emitWithAck('music:stop', { channelId: salaB })).nowPlaying).toBeNull()
      await waitLog(server, `[fake-music] leave ${salaB}`)
      expect(await queueOf(ana, salaA)).toEqual(['Outra longa'])
      expect(server.log).not.toContain(`[fake-music] leave ${salaA}`)

      await ana.socket.emitWithAck('music:stop', { channelId: salaA })
      await waitLog(server, `[fake-music] leave ${salaA}`)
    })

    it('a sala que esvazia encerra só a sua instância', async () => {
      const salaA = await roomWith(ana)
      const salaB = await roomWith(bia)
      playing(await play(ana, salaA, link(LONG)))
      playing(await play(bia, salaB, link(LONG)))
      const emptied = waitFor(ana.socket, 'music:state', (s) => s.channelId === salaB && s.nowPlaying === null)
      bia.socket.emit('voice:leave')
      await emptied
      await waitLog(server, `[fake-music] leave ${salaB}`)
      expect(await queueOf(ana, salaA)).toEqual(['Faixa longa'])
      expect(server.log).not.toContain(`[fake-music] leave ${salaA}`)
      await ana.socket.emitWithAck('music:stop', { channelId: salaA })
    })

    it('o estado de cada sala vai só para quem vê aquela sala', async () => {
      const owner = await server.asOwner()
      const privada = await room()
      const set = await owner.socket.emitWithAck('channel:set-overrides', {
        channelId: privada,
        overrides: [{ roleId: EVERYONE_ROLE_ID, allow: [], deny: ['view'] }]
      })
      expect(set.ok).toBe(true)
      await join(owner, privada)
      const publica = await roomWith(ana)
      const hidden = expectNoEvent(bia.socket, 'music:state', (s) => s.channelId === privada)
      const ownerSees = waitFor(owner.socket, 'music:state', (s) => s.channelId === privada && s.nowPlaying?.title === 'Faixa longa')
      const biaSees = waitFor(bia.socket, 'music:state', (s) => s.channelId === publica && s.nowPlaying?.title === 'Outra longa')
      playing(await play(owner, privada, link(LONG)))
      playing(await play(ana, publica, link(LONG_2)))
      await Promise.all([ownerSees, biaSees, hidden])
      await owner.socket.emitWithAck('music:stop', { channelId: privada })
      await ana.socket.emitWithAck('music:stop', { channelId: publica })
    })
  })

  describe('comandos vindos do chat', () => {
    const FAIXA = { title: 'Faixa longa', artists: ['Banda Teste'], coverUrl: 'https://i.scdn.co/capa.jpg' }
    const OUTRA = { title: 'Outra longa', artists: ['Banda Teste'], coverUrl: 'https://i.scdn.co/capa.jpg' }
    const textChannel = async (): Promise<string> => (await server.createChannel(`chat-${Math.random().toString(36).slice(2, 7)}`)).id
    const playFrom = (u: TestUser, channelId: string, query: string, textChannelId: string): Promise<MusicPlayResult> =>
      u.socket.emitWithAck('music:play', { channelId, query, textChannelId })
    const denyOn = async (channelId: string, deny: ChannelPermission[]): Promise<void> => {
      const owner = await server.asOwner()
      const res = await owner.socket.emitWithAck('channel:set-overrides', { channelId, overrides: [{ roleId: EVERYONE_ROLE_ID, allow: [], deny }] })
      if (!res.ok) throw new Error(res.error)
    }
    const summary = (m: Message): [string, string, string] => [m.author.accountId, m.kind ?? 'text', m.content]

    it('sucesso: o comando da pessoa e a resposta do bot, nessa ordem, para quem vê o canal (e no histórico)', async () => {
      const id = await roomWithAna()
      const chat = await textChannel()
      const seen = chatOf(bia, chat)
      playing(await playFrom(ana, id, link(LONG), chat))
      playing(await playFrom(ana, id, `  spotify:track:${LONG_2}  `, chat))
      playing(await ana.socket.emitWithAck('music:skip', { channelId: id, textChannelId: chat }))
      playing(await ana.socket.emitWithAck('music:stop', { channelId: id, textChannelId: chat }))
      await until(() => seen.length === 8, '8 mensagens no chat')
      const anaId = ana.self.accountId
      expect(seen.map(summary)).toEqual([
        [anaId, 'text', `/play ${link(LONG)}`],
        [anaId, 'tool', 'Tocando agora: Faixa longa — Banda Teste'],
        [anaId, 'text', `/play spotify:track:${LONG_2}`],
        [anaId, 'tool', 'Adicionou à fila: Outra longa — Banda Teste'],
        [anaId, 'text', '/skip'],
        [anaId, 'tool', 'Pulou: Faixa longa — Banda Teste. Tocando agora: Outra longa — Banda Teste'],
        [anaId, 'text', '/stop'],
        [anaId, 'tool', 'Parou a música e limpou a fila']
      ])
      expect(seen[1].tool).toEqual({ tool: 'music', result: { action: 'play', added: 1, startedNow: true, first: FAIXA } })
      expect(seen[3].tool).toEqual({ tool: 'music', result: { action: 'play', added: 1, startedNow: false, first: OUTRA } })
      expect(seen[5].tool).toEqual({ tool: 'music', result: { action: 'skip', skipped: FAIXA, next: OUTRA } })
      expect(seen[7].tool).toEqual({ tool: 'music', result: { action: 'stop' } })
      const history = await bia.socket.emitWithAck('message:history', { channelId: chat })
      expect(history.messages.map(summary)).toEqual(seen.map(summary))
      expect(history.messages[5].tool).toEqual(seen[5].tool)
    })

    it('o comando e o "procurando" chegam antes da busca terminar; a resposta troca a mesma mensagem, sem "(editada)"', async () => {
      const id = await roomWithAna()
      const chat = await textChannel()
      const seen = chatOf(bia, chat)
      const edits = editsOf(bia, chat)
      const pending = playFrom(ana, id, `  ${link(HELD)} `, chat)
      await until(() => seen.length === 2 && spotify.held() === 1, 'comando e "procurando" com a busca parada')
      const anaId = ana.self.accountId
      expect(seen.map(summary)).toEqual([
        [anaId, 'text', `/play ${link(HELD)}`],
        [anaId, 'tool', `Procurando “${link(HELD)}”…`]
      ])
      expect(seen[1].tool).toEqual({ tool: 'music', result: { action: 'searching', query: link(HELD) } })
      expect(edits).toEqual([])
      spotify.release()
      expect(playing(await pending).nowPlaying?.title).toBe('Faixa segurada')
      await until(() => edits.length === 1, 'a resposta no lugar do "procurando"')
      const first = { title: 'Faixa segurada', artists: ['Banda Teste'], coverUrl: 'https://i.scdn.co/capa.jpg' }
      const tool = { tool: 'music', result: { action: 'play', added: 1, startedNow: true, first } }
      expect(edits[0]).toEqual({ channelId: chat, messageId: seen[1].id, content: 'Tocando agora: Faixa segurada — Banda Teste', tool })
      const history = await bia.socket.emitWithAck('message:history', { channelId: chat })
      expect(history.messages[1]).toMatchObject({ id: seen[1].id, content: 'Tocando agora: Faixa segurada — Banda Teste', tool })
      expect(history.messages[1]).not.toHaveProperty('editedAt')
      await ana.socket.emitWithAck('music:stop', { channelId: id })
    })

    it('busca que falha depois de postar: o "procurando" vira o erro e o ack avisa que já postou', async () => {
      const id = await roomWithAna()
      const chat = await textChannel()
      const seen = chatOf(bia, chat)
      const edits = editsOf(bia, chat)
      expect(await playFrom(ana, id, link(MISSING), chat)).toEqual({ ok: false, error: 'Música não encontrada no Spotify', posted: true })
      await until(() => seen.length === 2 && edits.length === 1, 'comando, "procurando" e o erro')
      expect(edits[0]).toEqual({
        channelId: chat,
        messageId: seen[1].id,
        content: 'Não consegui tocar: Música não encontrada no Spotify',
        tool: { tool: 'music', result: { action: 'failed', query: link(MISSING), error: 'Música não encontrada no Spotify' } }
      })
      expect(playing(await ana.socket.emitWithAck('music:queue', id)).nowPlaying).toBeNull()
    })

    it('saiu da sala no meio da busca: não toca e o "procurando" vira o erro', async () => {
      const id = await roomWithAna()
      const chat = await textChannel()
      const seen = chatOf(bia, chat)
      const pending = playFrom(ana, id, link(HELD_2), chat)
      await until(() => seen.length === 2 && spotify.held() === 1, '"procurando" com a busca parada')
      const left = waitFor(bia.socket, 'voice:state', (all) => !all.some((v) => v.userId === ana.self.id && v.channelId === id))
      ana.socket.emit('voice:leave')
      await left
      spotify.release()
      expect(await pending).toEqual({ ok: false, error: 'Entre na sala de voz para controlar a música', posted: true })
      await until(() => seen[1].content === 'Não consegui tocar: Entre na sala de voz para controlar a música', 'o erro no lugar do "procurando"')
      expect(playing(await ana.socket.emitWithAck('music:queue', id)).nowPlaying).toBeNull()
    })

    it('playlist pedida no chat da própria sala: "Adicionou N músicas à fila"', async () => {
      const id = await roomWithAna()
      const seen = chatOf(bia, id)
      playing(await playFrom(ana, id, `https://open.spotify.com/playlist/${PLAYLIST}`, id))
      await until(() => seen.length === 2 && !seen[1].content.startsWith('Procurando'), 'comando e a resposta final no chat da sala')
      expect(seen[1].content).toBe('Adicionou 2 músicas à fila, começando por Chega de Saudade — João Gilberto')
      expect(seen[1].tool).toMatchObject({ tool: 'music', result: { action: 'play', added: 2, startedNow: true } })
      await ana.socket.emitWithAck('music:stop', { channelId: id })
    })

    it('erro não posta nada: link inválido, nada tocando, fora da sala', async () => {
      const id = await roomWithAna()
      const chat = await textChannel()
      const silent = expectNoEvent(ana.socket, 'message:new', (m) => m.channelId === chat)
      expect(await playFrom(ana, id, '   ', chat)).toEqual({ ok: false, error: INVALID })
      expect(await playFrom(ana, id, 'https://soundcloud.com/artista/musica', chat)).toEqual({ ok: false, error: INVALID })
      expect(await ana.socket.emitWithAck('music:skip', { channelId: id, textChannelId: chat })).toEqual({ ok: false, error: 'Nenhuma música tocando' })
      expect(await playFrom(bia, id, link(LONG), chat)).toEqual({ ok: false, error: 'Entre na sala de voz para controlar a música' })
      await silent
    })

    it('botões do player (sem canal de texto) não postam nada; o id em texto do app antigo ainda vale', async () => {
      const id = await roomWithAna()
      const silent = expectNoEvent(ana.socket, 'message:new', (m) => m.channelId === id)
      playing(await play(ana, id, link(LONG)))
      playing(await play(ana, id, link(LONG_2)))
      playing(await ana.socket.emitWithAck('music:skip', { channelId: id }))
      expect(playing(await ana.socket.emitWithAck('music:stop', id as never)).nowPlaying).toBeNull()
      await silent
    })

    it('sem `send` no canal do chat: recusa sem tocar nem postar', async () => {
      const id = await roomWithAna()
      const chat = await textChannel()
      await denyOn(chat, ['send'])
      const silent = expectNoEvent(bia.socket, 'message:new', (m) => m.channelId === chat)
      expect(await playFrom(ana, id, link(LONG), chat)).toEqual({ ok: false, error: 'Você não tem permissão para enviar mensagens neste canal' })
      expect(playing(await ana.socket.emitWithAck('music:queue', id)).nowPlaying).toBeNull()
      await silent
    })

    it('canal do chat privado: quem não vê não recebe; quem não vê não usa como chat', async () => {
      const owner = await server.asOwner()
      const id = await room()
      await join(owner, id)
      const chat = await textChannel()
      await denyOn(chat, ['view'])
      const hidden = expectNoEvent(bia.socket, 'message:new', (m) => m.channelId === chat)
      const hiddenEdit = expectNoEvent(bia.socket, 'message:edited', (e) => e.channelId === chat)
      const mine = chatOf(owner, chat)
      const mineEdits = editsOf(owner, chat)
      playing(await playFrom(owner, id, link(LONG), chat))
      await until(() => mine.length === 2 && mineEdits.length === 1, '2 mensagens e a resposta para a dona')
      await hidden
      await hiddenEdit
      const other = await roomWithAna()
      expect(await playFrom(ana, other, link(LONG), chat)).toEqual({ ok: false, error: 'Canal não encontrado' })
      expect(await playFrom(ana, other, link(LONG), 'nao-existe')).toEqual({ ok: false, error: 'Canal não encontrado' })
      await owner.socket.emitWithAck('music:stop', { channelId: id })
    })
  })
})

describe('bot de música: limites', () => {
  const livekit = new FakeLiveKit()
  let spotify: FakeSpotify
  let server: TestServer
  let ana: TestUser

  beforeAll(async () => {
    spotify = await startFakeSpotify()
    server = await TestServer.start({
      env: {
        ...liveKitEnv(await livekit.start()),
        RATE_LIMIT_MULTIPLIER: '1',
        SPOTIFY_CLIENT_ID: 'id',
        SPOTIFY_CLIENT_SECRET: 'segredo',
        SPOTIFY_ACCOUNTS_URL: spotify.url,
        SPOTIFY_API_URL: spotify.url,
        SPOTIFY_EMBED_URL: spotify.url
      },
      imports: ['./server/tests/fake-music-playback.ts']
    })
    ana = await server.newUser('Ana')
  })

  afterAll(async () => {
    ana?.socket.close()
    await server?.destroy()
    await livekit.stop()
    await new Promise((r) => spotify.server.close(r))
  })

  it('pausar e continuar não gastam a cota de tocar e pular', async () => {
    const channel = await server.createChannel('sala-limites', 'voice')
    const joined = await ana.socket.emitWithAck('voice:join', { channelId: channel.id, muted: false, deafened: false })
    expect(joined.ok).toBe(true)
    expect((await ana.socket.emitWithAck('music:play', { channelId: channel.id, query: link(LONG) })).ok).toBe(true)
    for (let i = 0; i < 3; i++) {
      expect((await ana.socket.emitWithAck('music:pause', { channelId: channel.id })).ok).toBe(true)
      expect((await ana.socket.emitWithAck('music:resume', { channelId: channel.id })).ok).toBe(true)
    }
    expect((await ana.socket.emitWithAck('music:play', { channelId: channel.id, query: link(LONG_2) })).ok).toBe(true)
    await ana.socket.emitWithAck('music:stop', { channelId: channel.id })
  })
})
