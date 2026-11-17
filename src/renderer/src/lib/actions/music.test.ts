import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MusicState, MusicTrack } from '@shared/types'
import {
  bindMusicEvents,
  describeQueue,
  loadMusicQueue,
  parseMusicCommand,
  playMusic,
  runMusicCommand,
  skipMusic,
  stopMusic
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
    [`/tocar ${LINK}`, { kind: 'play', url: LINK }],
    [`  /TOCAR   ${LINK}  `, { kind: 'play', url: LINK }],
    ['/tocar', { kind: 'usage', text: 'Use /tocar <link do Spotify>' }],
    ['/pular', { kind: 'skip' }],
    ['/parar', { kind: 'stop' }],
    ['/fila', { kind: 'queue' }]
  ])('%s', (text, expected) => {
    expect(parseMusicCommand(text)).toEqual(expected)
  })

  it.each([['oi /tocar x'], ['/tocarx'], ['/pularam'], ['tocar x'], ['']])('não é comando: %s', (text) => {
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

  it('describeQueue resume o que toca e a fila', () => {
    expect(describeQueue(state({ nowPlaying: null }))).toBe('Nenhuma música tocando.')
    expect(describeQueue(state())).toBe('Tocando agora: Garota de Ipanema — Tom Jobim, Vinicius. Fila vazia.')
    expect(describeQueue(state({ queue: [aguas] }))).toBe(
      'Tocando agora: Garota de Ipanema — Tom Jobim, Vinicius. Na fila: 1. Águas de Março — Tom Jobim, Vinicius'
    )
  })
})

describe('ações', () => {
  it('playMusic manda o pedido e aplica o estado da resposta', async () => {
    socket.replyTo('music:play', () => ({ ok: true, state: state() }))
    await playMusic('sala', LINK)
    expect(socket.sent('music:play')[0][0]).toEqual({ channelId: 'sala', url: LINK })
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

describe('runMusicCommand', () => {
  it('texto comum não é tratado', () => {
    expect(runMusicCommand('bom dia')).toBe(false)
    expect(socket.emitted).toEqual([])
  })

  it('fora de uma sala de voz: avisa e não manda nada', () => {
    useApp.setState({ myVoiceChannelId: null })
    expect(runMusicCommand('/pular')).toBe(true)
    expect(useApp.getState().notice?.text).toBe('Entre numa sala de voz para usar os comandos de música')
    expect(socket.emitted).toEqual([])
  })

  it('/tocar pede na sala em que estou; entrando na fila, avisa', async () => {
    socket.replyTo('music:play', () => ({ ok: true, state: state({ queue: [aguas] }) }))
    expect(runMusicCommand(`/tocar ${LINK}`)).toBe(true)
    await flush()
    expect(socket.sent('music:play')[0][0]).toEqual({ channelId: 'sala', url: LINK })
    expect(useApp.getState().notice).toMatchObject({ text: 'Na fila: Águas de Março — Tom Jobim, Vinicius', kind: 'info' })
  })

  it('/tocar recusado: mostra o erro do servidor', async () => {
    socket.replyTo('music:play', () => ({ ok: false, error: 'Envie um link de música do Spotify (open.spotify.com/track/...)' }))
    runMusicCommand('/tocar https://youtu.be/x')
    await flush()
    expect(useApp.getState().notice).toMatchObject({ text: 'Envie um link de música do Spotify (open.spotify.com/track/...)', kind: 'error' })
  })

  it('/fila mostra a fila', async () => {
    socket.replyTo('music:queue', () => ({ ok: true, state: state() }))
    runMusicCommand('/fila')
    await flush()
    expect(useApp.getState().notice).toMatchObject({ text: 'Tocando agora: Garota de Ipanema — Tom Jobim, Vinicius. Fila vazia.', kind: 'info' })
  })

  it('/pular e /parar', async () => {
    socket.replyTo('music:skip', () => ({ ok: true, state: state({ nowPlaying: aguas }) }))
    socket.replyTo('music:stop', () => ({ ok: true, state: state({ nowPlaying: null }) }))
    runMusicCommand('/pular')
    await flush()
    expect(useApp.getState().musicRooms.sala.nowPlaying?.id).toBe('t2')
    runMusicCommand('/parar')
    await flush()
    expect(useApp.getState().musicRooms).toEqual({})
  })

  it('/tocar sem link: mostra como usar', () => {
    runMusicCommand('/tocar')
    expect(useApp.getState().notice?.text).toBe('Use /tocar <link do Spotify>')
    expect(socket.emitted).toEqual([])
  })
})
