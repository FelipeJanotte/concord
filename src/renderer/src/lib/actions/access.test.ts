// Reação do app às mudanças de permissão (A4): canais visíveis e saída forçada da voz.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, User } from '@shared/types'
import { bindChannelEvents } from '@/lib/actions/channels'
import { bindVoiceEvents } from '@/lib/actions/voice'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const channel = (id: string, type: 'text' | 'voice' = 'text'): Channel => ({ id, name: id, type, createdAt: 0 })
const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }

let socket: FakeSocket

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindChannelEvents(socket.asSocket())
  bindVoiceEvents(socket.asSocket())
  socket.replyTo('message:history', () => ({ messages: [], hasMore: false }))
  useApp.setState({
    ...initialState,
    self: me,
    channels: [channel('geral'), channel('segredo'), channel('sala', 'voice')],
    view: { kind: 'text', channelId: 'segredo' },
    messages: { segredo: [], geral: [] },
    unread: { segredo: true },
    hasMoreHistory: { segredo: true }
  })
})

afterEach(() => {
  setSocket(null)
  vi.restoreAllMocks()
})

describe('channels:visible', () => {
  it('canal que deixou de ser visível some, com histórico e não lidos; a tela vai para outro canal', () => {
    socket.receive('channels:visible', [channel('geral'), channel('sala', 'voice')])
    const st = useApp.getState()
    expect(st.channels.map((c) => c.id)).toEqual(['geral', 'sala'])
    expect(st.view).toEqual({ kind: 'text', channelId: 'geral' })
    expect(st.messages.segredo).toBeUndefined()
    expect(st.unread.segredo).toBeUndefined()
    expect(st.hasMoreHistory.segredo).toBeUndefined()
    expect(st.messages.geral).toEqual([]) // o que continua visível fica como estava
  })

  it('canal que passou a ser visível aparece sem mexer na tela atual', () => {
    useApp.setState({ view: { kind: 'text', channelId: 'geral' } })
    socket.receive('channels:visible', [channel('geral'), channel('segredo'), channel('sala', 'voice'), channel('novo')])
    expect(useApp.getState().channels.map((c) => c.id)).toContain('novo')
    expect(useApp.getState().view).toEqual({ kind: 'text', channelId: 'geral' })
  })

  it('sala de voz que deixou de ser visível: sai da voz', () => {
    const leave = vi.spyOn(voice, 'leave').mockImplementation(() => {})
    useApp.setState({ myVoiceChannelId: 'sala' })
    socket.receive('channels:visible', [channel('geral'), channel('segredo')])
    expect(leave).toHaveBeenCalled()
    expect(useApp.getState().myVoiceChannelId).toBeNull()
  })
})

describe('voice:state sem mim', () => {
  it('o servidor me tirou da sala: sai localmente e avisa', () => {
    const teardown = vi.spyOn(voice, 'teardown').mockImplementation(() => {})
    useApp.setState({ myVoiceChannelId: 'sala' })
    socket.receive('voice:state', [{ userId: 'outra', channelId: 'sala', muted: false, deafened: false }])
    expect(teardown).toHaveBeenCalled()
    expect(useApp.getState().myVoiceChannelId).toBeNull()
    expect(useApp.getState().notice?.text).toBe('Você saiu da sala de voz.')
  })

  it('comigo na lista, ou ainda entrando, nada muda', () => {
    const teardown = vi.spyOn(voice, 'teardown').mockImplementation(() => {})
    useApp.setState({ myVoiceChannelId: 'sala' })
    socket.receive('voice:state', [{ userId: me.id, channelId: 'sala', muted: false, deafened: false }])
    useApp.setState({ joiningVoice: true })
    socket.receive('voice:state', [])
    expect(teardown).not.toHaveBeenCalled()
    expect(useApp.getState().myVoiceChannelId).toBe('sala')
  })
})
