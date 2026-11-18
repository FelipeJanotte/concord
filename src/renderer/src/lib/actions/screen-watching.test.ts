import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { User, VoiceState } from '@shared/types'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { watchScreens } from './screen-watching'

const SELF = { id: 'eu' } as User
let socket: FakeSocket

function me(watching?: string[]): VoiceState {
  return { userId: 'eu', channelId: 'sala', muted: false, deafened: false, sharing: false, watching }
}

beforeEach(() => {
  useApp.setState({ ...initialState, self: SELF, myVoiceChannelId: 'sala', voice: [me()] })
  socket = new FakeSocket()
  setSocket(socket.asSocket())
})

afterEach(() => setSocket(null))

describe('watchScreens', () => {
  it('avisa o servidor quais telas estou assistindo', () => {
    watchScreens(['ana', 'bia'])
    expect(socket.sent('voice:watching')).toEqual([[['ana', 'bia']]])
  })

  it('a mesma lista que o servidor já tem não é enviada de novo', () => {
    useApp.setState({ voice: [me(['ana'])] })
    watchScreens(['ana'])
    expect(socket.sent('voice:watching')).toEqual([])
    watchScreens(['ana', 'bia'])
    watchScreens([])
    expect(socket.sent('voice:watching')).toEqual([[['ana', 'bia']], [[]]])
  })

  it('sem assistir nada e o servidor sem nada: não envia', () => {
    watchScreens([])
    expect(socket.sent('voice:watching')).toEqual([])
  })

  it('fora da sala: não envia', () => {
    useApp.setState({ myVoiceChannelId: null, voice: [] })
    watchScreens(['ana'])
    expect(socket.sent('voice:watching')).toEqual([])
  })
})
