import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MusicState, MusicTrack } from '@shared/types'
import {
  bindMusicEvents,
  closeMusicQueue,
  loadMusicQueue,
  musicCommandDraft,
  openMusicQueue,
  parseMusicCommand,
  playMusic,
  runMusicCommand,
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
const state = (over: Partial<MusicState> = {}): MusicState => ({ channelId: 'sala', nowPlaying: ipanema, queue: [], ...over })
const LINK = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'

let socket: FakeSocket
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

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
    ['/queue', { kind: 'queue' }]
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
    socket.replyTo('music:play', () => ({ ok: true, state: state(), added: 1 }))
    await playMusic('sala', LINK)
    expect(socket.sent('music:play')[0][0]).toEqual({ channelId: 'sala', query: LINK })
    expect(useApp.getState().musicRooms.sala.nowPlaying?.id).toBe('t1')
  })

  it('erro do servidor vira exceção com a mensagem', async () => {
    socket.replyTo('music:skip', () => ({ ok: false, error: 'Nenhuma música tocando' }))
    await expect(skipMusic('sala')).rejects.toThrow('Nenhuma música tocando')
  })

  it('stopMusic e loadMusicQueue mandam o id da sala', async () => {
    useApp.setState({ musicRooms: { sala: state() } })
    socket.replyTo('music:stop', () => ({ ok: true, state: state({ nowPlaying: null }) }))
    socket.replyTo('music:queue', () => ({ ok: true, state: state({ queue: [aguas] }) }))
    await stopMusic('sala')
    expect(useApp.getState().musicRooms).toEqual({})
    await loadMusicQueue('sala')
    expect(socket.sent('music:stop')[0][0]).toBe('sala')
    expect(useApp.getState().musicRooms.sala.queue).toEqual([aguas])
  })
})

describe('musicCommandDraft', () => {
  it.each([
    ['/play', { command: '/play', rest: '', takesQuery: true }],
    ['/play ', { command: '/play', rest: ' ', takesQuery: true }],
    ['/PLAY lofi', { command: '/PLAY', rest: ' lofi', takesQuery: true }],
    ['/play\nlinha', { command: '/play', rest: '\nlinha', takesQuery: true }],
    ['/skip', { command: '/skip', rest: '', takesQuery: false }],
    ['/stop', { command: '/stop', rest: '', takesQuery: false }],
    ['/Queue ', { command: '/Queue', rest: ' ', takesQuery: false }]
  ])('%j', (text, expected) => {
    expect(musicCommandDraft(text)).toEqual(expected)
  })

  it.each([[''], ['/pla'], ['/playx'], [' /play'], ['oi /play'], ['/pular'], ['/queues']])('não é comando: %j', (text) => {
    expect(musicCommandDraft(text)).toBeNull()
  })
})

describe('runMusicCommand', () => {
  it('texto comum não é tratado', () => {
    expect(runMusicCommand('bom dia')).toBe(false)
    expect(socket.emitted).toEqual([])
  })

  it('fora de uma sala de voz: avisa e não manda nada', () => {
    useApp.setState({ myVoiceChannelId: null })
    expect(runMusicCommand('/skip')).toBe(true)
    expect(useApp.getState().notice?.text).toBe('Entre numa sala de voz para usar os comandos de música')
    expect(socket.emitted).toEqual([])
  })

  it('/play pede na sala em que estou; entrando na fila, avisa', async () => {
    socket.replyTo('music:play', () => ({ ok: true, state: state({ queue: [aguas] }), added: 1 }))
    expect(runMusicCommand(`/play ${LINK}`)).toBe(true)
    await flush()
    expect(socket.sent('music:play')[0][0]).toEqual({ channelId: 'sala', query: LINK })
    expect(useApp.getState().notice).toMatchObject({ text: 'Na fila: Águas de Março — Tom Jobim, Vinicius', kind: 'info' })
  })

  it('/play de playlist: avisa quantas músicas entraram na fila', async () => {
    socket.replyTo('music:play', () => ({ ok: true, state: state({ queue: [aguas] }), added: 12 }))
    runMusicCommand('/play https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
    await flush()
    expect(useApp.getState().notice).toMatchObject({ text: '12 músicas adicionadas à fila', kind: 'info' })
  })

  it('/play recusado: mostra o erro do servidor', async () => {
    socket.replyTo('music:play', () => ({ ok: false, error: 'Nada encontrado para essa busca' }))
    runMusicCommand('/play música que não existe')
    await flush()
    expect(useApp.getState().notice).toMatchObject({ text: 'Nada encontrado para essa busca', kind: 'error' })
  })

  it('/queue busca a fila da sala e abre o painel da fila', async () => {
    socket.replyTo('music:queue', () => ({ ok: true, state: state({ queue: [aguas] }) }))
    runMusicCommand('/queue')
    await flush()
    expect(socket.sent('music:queue')).toEqual([['sala']])
    expect(useApp.getState().musicRooms.sala.queue).toEqual([aguas])
    expect(useApp.getState().musicQueueChannelId).toBe('sala')
    expect(useApp.getState().notice).toBeNull()
  })

  it('/skip e /stop', async () => {
    socket.replyTo('music:skip', () => ({ ok: true, state: state({ nowPlaying: aguas }) }))
    socket.replyTo('music:stop', () => ({ ok: true, state: state({ nowPlaying: null }) }))
    runMusicCommand('/skip')
    await flush()
    expect(useApp.getState().musicRooms.sala.nowPlaying?.id).toBe('t2')
    runMusicCommand('/stop')
    await flush()
    expect(useApp.getState().musicRooms).toEqual({})
  })

  it('/play sem nada: mostra como usar', () => {
    runMusicCommand('/play')
    expect(useApp.getState().notice?.text).toBe('Use /play <link ou nome da música>')
    expect(socket.emitted).toEqual([])
  })
})
