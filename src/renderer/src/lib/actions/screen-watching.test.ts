import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { User, VoiceState } from '@shared/types'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { watchScreens } from './screen-watching'

const SELF = { id: 'eu' } as User
let socket: FakeSocket

function me(watching?: string[], channelId = 'sala'): VoiceState {
  return { userId: 'eu', channelId, muted: false, deafened: false, sharing: false, watching }
}

function serverKnows(watching: string[]): void {
  const { myVoiceChannelId } = useApp.getState()
  useApp.setState({ voice: [me(watching, myVoiceChannelId ?? 'sala')] })
}

beforeEach(() => {
  useApp.setState({ myVoiceChannelId: null })
  useApp.setState({ ...initialState, self: SELF, myVoiceChannelId: 'sala', voice: [me()] })
  socket = new FakeSocket()
  setSocket(socket.asSocket())
})

afterEach(() => setSocket(null))

describe('watchScreens', () => {
  it('avisa o servidor quais telas estou assistindo', () => {
    watchScreens('room', ['ana', 'bia'])
    expect(socket.sent('voice:watching')).toEqual([[['ana', 'bia']]])
  })

  it('a mesma lista que o servidor já tem não é enviada de novo', () => {
    serverKnows(['ana'])
    watchScreens('room', ['ana'])
    expect(socket.sent('voice:watching')).toEqual([])
    watchScreens('room', ['ana', 'bia'])
    serverKnows(['ana', 'bia'])
    watchScreens('room', [])
    expect(socket.sent('voice:watching')).toEqual([[['ana', 'bia']], [[]]])
  })

  it('sem assistir nada e o servidor sem nada: não envia', () => {
    watchScreens('room', [])
    expect(socket.sent('voice:watching')).toEqual([])
  })

  it('fora da sala: não envia', () => {
    useApp.setState({ myVoiceChannelId: null, voice: [] })
    watchScreens('room', ['ana'])
    watchScreens('pip', ['bia'])
    expect(socket.sent('voice:watching')).toEqual([])
  })

  it('a miniatura sozinha também conta como assistir', () => {
    watchScreens('pip', ['ana'])
    expect(socket.sent('voice:watching')).toEqual([[['ana']]])
  })

  it('envia a união da sala e da miniatura, sem repetir e na ordem em que apareceram', () => {
    watchScreens('room', ['ana', 'bia'])
    serverKnows(['ana', 'bia'])
    watchScreens('pip', ['bia', 'caio'])
    expect(socket.sent('voice:watching')).toEqual([[['ana', 'bia']], [['ana', 'bia', 'caio']]])
  })

  it('tirar uma origem mantém as telas da outra', () => {
    watchScreens('room', ['ana'])
    serverKnows(['ana'])
    watchScreens('pip', ['bia'])
    serverKnows(['ana', 'bia'])
    watchScreens('room', [])
    expect(socket.sent('voice:watching').at(-1)).toEqual([['bia']])
  })

  it('a união que não muda não é enviada', () => {
    watchScreens('room', ['ana'])
    serverKnows(['ana'])
    watchScreens('pip', ['ana'])
    expect(socket.sent('voice:watching')).toEqual([[['ana']]])
  })

  it('passa a união para o cliente de voz', () => {
    watchScreens('room', ['ana'])
    watchScreens('pip', ['bia', 'ana'])
    expect(voice.watchedScreens).toEqual(['ana', 'bia'])
    watchScreens('room', [])
    expect(voice.watchedScreens).toEqual(['bia', 'ana'])
  })

  it('ao trocar de sala, o que eu assistia na anterior não vai para a nova', () => {
    watchScreens('pip', ['ana'])
    useApp.setState({ myVoiceChannelId: 'outra', voice: [me(undefined, 'outra')] })
    watchScreens('room', ['bia'])
    expect(socket.sent('voice:watching').at(-1)).toEqual([['bia']])
    expect(voice.watchedScreens).toEqual(['bia'])
  })

  it('ao sair e voltar para a mesma sala, começa sem nada', () => {
    watchScreens('pip', ['ana'])
    useApp.setState({ myVoiceChannelId: null, voice: [] })
    watchScreens('room', [])
    useApp.setState({ myVoiceChannelId: 'sala', voice: [me()] })
    watchScreens('room', ['bia'])
    expect(socket.sent('voice:watching').at(-1)).toEqual([['bia']])
  })
})
