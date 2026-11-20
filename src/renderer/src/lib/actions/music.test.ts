import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MusicState, MusicTrack } from '@shared/types'
import {
  applyMusicState,
  bindMusicEvents,
  closeMusicQueue,
  loadMusicQueue,
  openMusicQueue,
  dismissCollection,
  jumpToTrack,
  parseMusicCommand,
  pauseMusic,
  playMusic,
  resumeMusic,
  runMusicCommand,
  shuffleMusic,
  skipMusic,
  stopMusic,
  trackDuration
} from '@/lib/actions/music'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const track = (id: string, title: string): MusicTrack => ({
  id,
  title,
  artists: ['Tom Jobim', 'Vinicius'],
  coverUrl: null,
  durationMs: 200_000,
  url: `https://open.spotify.com/track/${id}`,
  requestedBy: { accountId: 'acc-ana', name: 'Ana' }
})
const ipanema = track('t1', 'Garota de Ipanema')
const aguas = track('t2', 'Águas de Março')
const state = (over: Partial<MusicState> = {}): MusicState => ({ channelId: 'sala', nowPlaying: ipanema, queue: [], paused: false, elapsedMs: 0, ...over })
const LINK = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'

let socket: FakeSocket

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  useApp.setState({ ...initialState, myVoiceChannelId: 'sala' })
  bindMusicEvents(socket.asSocket())
})

afterEach(() => setSocket(null))

describe('parseMusicCommand', () => {
  it.each([
    [`/play ${LINK}`, { kind: 'play', query: LINK }],
    [`  /PLAY   ${LINK}  `, { kind: 'play', query: LINK }],
    ['/play garota de ipanema', { kind: 'play', query: 'garota de ipanema' }],
    ['/play', { kind: 'usage', text: 'Use /play <link ou nome da música>' }],
    ['/skip', { kind: 'skip' }],
    ['/STOP', { kind: 'stop' }],
    ['/queue', { kind: 'queue' }],
    ['/Shuffle', { kind: 'shuffle' }]
  ])('%s', (text, expected) => {
    expect(parseMusicCommand(text)).toEqual(expected)
  })

  it.each([['oi /play x'], ['/playx'], ['/tocar x'], ['/pular'], ['/parar'], ['/fila'], ['/skipped'], ['play x'], ['']])('não é comando: %s', (text) => {
    expect(parseMusicCommand(text)).toBeNull()
  })
})

describe('estado da sala', () => {
  it('music:state guarda a sala tocando e some quando para', () => {
    socket.receive('music:state', state())
    expect(useApp.getState().musicRooms.sala.nowPlaying?.title).toBe('Garota de Ipanema')
    socket.receive('music:state', state({ nowPlaying: null }))
    expect(useApp.getState().musicRooms).toEqual({})
  })

  it('duas salas tocando: cada music:state mexe só na sua sala', () => {
    socket.receive('music:state', state())
    socket.receive('music:state', state({ channelId: 'outra', nowPlaying: aguas }))
    expect(useApp.getState().musicRooms.sala.nowPlaying?.title).toBe('Garota de Ipanema')
    expect(useApp.getState().musicRooms.outra.nowPlaying?.title).toBe('Águas de Março')
    socket.receive('music:state', state({ channelId: 'outra', nowPlaying: null }))
    expect(Object.keys(useApp.getState().musicRooms)).toEqual(['sala'])
  })

  it('guarda quando o estado de cada sala chegou, para o progresso andar a partir dali', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(5_000)
    socket.receive('music:state', state())
    expect(useApp.getState().musicSyncedAt).toEqual({ sala: 5_000 })
    now.mockReturnValue(9_000)
    socket.receive('music:state', state({ nowPlaying: null }))
    expect(useApp.getState().musicSyncedAt).toEqual({})
    now.mockRestore()
  })

  it('openMusicQueue e closeMusicQueue abrem e fecham o painel da fila da sala', () => {
    openMusicQueue('sala')
    expect(useApp.getState().musicQueueChannelId).toBe('sala')
    closeMusicQueue()
    expect(useApp.getState().musicQueueChannelId).toBeNull()
  })

  it('trackDuration mostra minutos e segundos', () => {
    expect(trackDuration(185_000)).toBe('3:05')
    expect(trackDuration(59_400)).toBe('0:59')
  })
})

describe('ações', () => {
  it('playMusic manda o pedido e aplica o estado da resposta', async () => {
    socket.replyTo('music:play', () => ({ ok: true, state: state(), added: 1, collection: null }))
    await playMusic('sala', LINK)
    expect(socket.sent('music:play')[0][0]).toEqual({ channelId: 'sala', query: LINK })
    expect(useApp.getState().musicRooms.sala.nowPlaying?.id).toBe('t1')
  })

  it('playMusic guarda a playlist ou álbum tocado; uma música solta limpa', async () => {
    const collection = { kind: 'album' as const, title: 'Elis & Tom', url: 'https://open.spotify.com/album/a1' }
    socket.replyTo('music:play', () => ({ ok: true, state: state(), added: 14, collection }))
    expect(await playMusic('sala', collection.url)).toMatchObject({ added: 14, collection })
    expect(useApp.getState().roomCollection).toEqual({ channelId: 'sala', collection })
    dismissCollection()
    expect(useApp.getState().roomCollection).toBeNull()
    useApp.setState({ roomCollection: { channelId: 'sala', collection } })
    socket.replyTo('music:play', () => ({ ok: true, state: state(), added: 1, collection: null }))
    await playMusic('sala', 'garota de ipanema')
    expect(useApp.getState().roomCollection).toBeNull()
  })

  it('a playlist tocada acaba quando a música daquela sala acaba; o fim de outra sala não mexe', () => {
    const collection = { kind: 'album' as const, title: 'Elis & Tom', url: 'https://open.spotify.com/album/a1' }
    useApp.setState({ roomCollection: { channelId: 'sala', collection } })
    applyMusicState(state({ channelId: 'outra', nowPlaying: null }))
    expect(useApp.getState().roomCollection).toEqual({ channelId: 'sala', collection })
    applyMusicState(state({ nowPlaying: null }))
    expect(useApp.getState().roomCollection).toBeNull()
  })

  it('pauseMusic e resumeMusic mandam o id da sala e aplicam o estado', async () => {
    socket.replyTo('music:pause', () => ({ ok: true, state: state({ paused: true, elapsedMs: 42_000 }) }))
    socket.replyTo('music:resume', () => ({ ok: true, state: state({ paused: false, elapsedMs: 42_000 }) }))
    await pauseMusic('sala')
    expect(useApp.getState().musicRooms.sala).toMatchObject({ paused: true, elapsedMs: 42_000 })
    await resumeMusic('sala')
    expect(socket.sent('music:pause')).toEqual([[{ channelId: 'sala' }]])
    expect(socket.sent('music:resume')).toEqual([[{ channelId: 'sala' }]])
    expect(useApp.getState().musicRooms.sala.paused).toBe(false)
  })

  it('erro do servidor vira exceção com a mensagem', async () => {
    socket.replyTo('music:skip', () => ({ ok: false, error: 'Nenhuma música tocando' }))
    await expect(skipMusic('sala')).rejects.toThrow('Nenhuma música tocando')
  })

  it('jumpToTrack manda a sala e a música escolhida e aplica o estado, sem levar chat', async () => {
    socket.replyTo('music:jump', () => ({ ok: true, state: state({ nowPlaying: aguas }) }))
    await jumpToTrack('sala', 't2')
    expect(socket.sent('music:jump')).toEqual([[{ channelId: 'sala', trackId: 't2' }]])
    expect(useApp.getState().musicRooms.sala.nowPlaying?.id).toBe('t2')
  })

  it('shuffleMusic manda o id da sala e aplica a fila nova', async () => {
    socket.replyTo('music:shuffle', () => ({ ok: true, state: state({ queue: [aguas, ipanema] }) }))
    await shuffleMusic('sala')
    expect(socket.sent('music:shuffle')).toEqual([[{ channelId: 'sala' }]])
    expect(useApp.getState().musicRooms.sala.queue).toEqual([aguas, ipanema])
  })

  it('stopMusic e loadMusicQueue mandam o id da sala', async () => {
    useApp.setState({ musicRooms: { sala: state() } })
    socket.replyTo('music:stop', () => ({ ok: true, state: state({ nowPlaying: null }) }))
    socket.replyTo('music:queue', () => ({ ok: true, state: state({ queue: [aguas] }) }))
    await stopMusic('sala')
    expect(useApp.getState().musicRooms).toEqual({})
    await loadMusicQueue('sala')
    expect(socket.sent('music:stop')[0][0]).toEqual({ channelId: 'sala' })
    expect(useApp.getState().musicRooms.sala.queue).toEqual([aguas])
  })
})

describe('runMusicCommand', () => {
  it('texto comum não é tratado', () => {
    expect(runMusicCommand('bom dia', 'geral')).toBeNull()
    expect(socket.emitted).toEqual([])
  })

  it('fora de uma sala de voz: avisa, não manda nada e falha', async () => {
    useApp.setState({ myVoiceChannelId: null })
    expect(await runMusicCommand('/skip', 'geral')).toBe(false)
    expect(useApp.getState().notice?.text).toBe('Entre numa sala de voz para usar os comandos de música')
    expect(socket.emitted).toEqual([])
  })

  it('/play pede na sala em que estou, leva o chat de onde veio e não avisa (o bot responde no chat)', async () => {
    socket.replyTo('music:play', () => ({ ok: true, state: state({ queue: [aguas] }), added: 1 }))
    expect(await runMusicCommand(`/play ${LINK}`, 'geral')).toBe(true)
    expect(socket.sent('music:play')[0][0]).toEqual({ channelId: 'sala', query: LINK, textChannelId: 'geral' })
    expect(useApp.getState().musicRooms.sala.queue).toEqual([aguas])
    expect(useApp.getState().notice).toBeNull()
  })

  it('/play recusado: mostra o erro do servidor e falha', async () => {
    socket.replyTo('music:play', () => ({ ok: false, error: 'Nada encontrado para essa busca' }))
    expect(await runMusicCommand('/play música que não existe', 'geral')).toBe(false)
    expect(useApp.getState().notice).toMatchObject({ text: 'Nada encontrado para essa busca', kind: 'error' })
  })

  it('/play recusado depois que o comando já foi postado: mostra o erro e conta como enviado', async () => {
    socket.replyTo('music:play', () => ({ ok: false, error: 'Música não encontrada no Spotify', posted: true }))
    expect(await runMusicCommand(`/play ${LINK}`, 'geral')).toBe(true)
    expect(useApp.getState().notice).toMatchObject({ text: 'Música não encontrada no Spotify', kind: 'error' })
  })

  it('/queue busca a fila da sala e abre o painel da fila, sem levar o chat', async () => {
    socket.replyTo('music:queue', () => ({ ok: true, state: state({ queue: [aguas] }) }))
    expect(await runMusicCommand('/queue', 'geral')).toBe(true)
    expect(socket.sent('music:queue')).toEqual([['sala']])
    expect(useApp.getState().musicRooms.sala.queue).toEqual([aguas])
    expect(useApp.getState().musicQueueChannelId).toBe('sala')
    expect(useApp.getState().notice).toBeNull()
  })

  it('/skip e /stop levam o chat de onde vieram', async () => {
    socket.replyTo('music:skip', () => ({ ok: true, state: state({ nowPlaying: aguas }) }))
    socket.replyTo('music:stop', () => ({ ok: true, state: state({ nowPlaying: null }) }))
    expect(await runMusicCommand('/skip', 'geral')).toBe(true)
    expect(socket.sent('music:skip')).toEqual([[{ channelId: 'sala', textChannelId: 'geral' }]])
    expect(useApp.getState().musicRooms.sala.nowPlaying?.id).toBe('t2')
    expect(await runMusicCommand('/stop', 'geral')).toBe(true)
    expect(socket.sent('music:stop')).toEqual([[{ channelId: 'sala', textChannelId: 'geral' }]])
    expect(useApp.getState().musicRooms).toEqual({})
  })

  it('/shuffle leva o chat de onde veio', async () => {
    socket.replyTo('music:shuffle', () => ({ ok: true, state: state({ queue: [aguas] }) }))
    expect(await runMusicCommand('/shuffle', 'geral')).toBe(true)
    expect(socket.sent('music:shuffle')).toEqual([[{ channelId: 'sala', textChannelId: 'geral' }]])
  })

  it('/play sem nada: mostra como usar e falha', async () => {
    expect(await runMusicCommand('/play', 'geral')).toBe(false)
    expect(useApp.getState().notice?.text).toBe('Use /play <link ou nome da música>')
    expect(socket.emitted).toEqual([])
  })
})
