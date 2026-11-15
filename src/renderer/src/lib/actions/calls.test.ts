// Chamadas no app (B8): toque, ligar/atender (entra na sala da conversa), fim da chamada e avisos.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CallEnded, CallInfo, DmEntry, User } from '@shared/types'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { acceptCall, bindCallsEvents, cancelCall, declineCall, hangUp, loadCalls, ringer, startCall } from './calls'
import { chimes } from './voice-sounds'

const me: User = { id: 'sock-eu', accountId: 'eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const dm: DmEntry = {
  channel: { id: 'dm1', name: 'dm', type: 'dm', createdAt: 0 },
  other: { id: 'ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
}
const call = (over: Partial<CallInfo> = {}): CallInfo => ({
  channelId: 'dm1',
  callerId: 'ana',
  calleeId: 'eu',
  status: 'ringing',
  since: 0,
  ...over
})
const ended = (reason: CallEnded['reason'], callerId = 'ana'): CallEnded => ({
  channelId: 'dm1',
  callerId,
  calleeId: callerId === 'ana' ? 'eu' : 'ana',
  reason
})

let socket: FakeSocket
let start: ReturnType<typeof vi.spyOn>
let stop: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindCallsEvents(socket.asSocket())
  useApp.setState({ ...initialState, self: me, dms: [dm], view: { kind: 'text', channelId: 'geral' } })
  start = vi.spyOn(ringer, 'start').mockImplementation(() => {})
  stop = vi.spyOn(ringer, 'stop').mockImplementation(() => {})
  vi.spyOn(chimes, 'play').mockReturnValue(true)
  vi.spyOn(voice, 'join').mockResolvedValue({ micError: null, cancelled: false, canSpeak: true, canShare: true })
  vi.spyOn(voice, 'inRoom', 'get').mockReturnValue(true)
})

afterEach(() => {
  setSocket(null)
  vi.restoreAllMocks()
})

describe('toque', () => {
  it('alguém me ligando: toca "incoming"; atendida: para', () => {
    socket.receive('call:updated', call())
    expect(start).toHaveBeenLastCalledWith('incoming', expect.objectContaining({ volume: expect.any(Number) }))
    socket.receive('call:updated', call({ status: 'active' }))
    expect(stop).toHaveBeenCalled()
  })

  it('chamada minha feita em outra janela: esta não toca "chamando"', () => {
    socket.receive('call:updated', call({ callerId: 'eu', calleeId: 'ana' }))
    expect(start).not.toHaveBeenCalled()
  })

  it('a conexão caiu: limpa as chamadas e para de tocar', () => {
    socket.receive('call:updated', call())
    // 'disconnect' é evento do próprio Socket.IO, fora do contrato
    ;(socket.receive as unknown as (event: string) => void)('disconnect')
    expect(useApp.getState().calls).toEqual({})
    expect(stop).toHaveBeenCalled()
  })

  it('loadCalls traz a chamada que ainda está tocando', async () => {
    socket.replyTo('call:list', () => [call()])
    await loadCalls()
    expect(useApp.getState().calls.dm1.status).toBe('ringing')
    expect(start).toHaveBeenCalledWith('incoming', expect.anything())
  })
})

describe('ligar e atender', () => {
  it('ligar: guarda a chamada, toca "chamando" e entra na sala da conversa sem sair da tela', async () => {
    socket.replyTo('call:invite', () => ({ ok: true, call: call({ callerId: 'eu', calleeId: 'ana' }) }))
    await startCall('dm1')
    expect(socket.sent('call:invite')[0][0]).toBe('dm1')
    expect(start).toHaveBeenCalledWith('outgoing', expect.anything())
    expect(voice.join).toHaveBeenCalledWith('dm1')
    expect(useApp.getState()).toMatchObject({ myVoiceChannelId: 'dm1', section: 'community', view: { kind: 'text', channelId: 'geral' } })
  })

  it('erro ao ligar vira exceção e não entra na sala', async () => {
    socket.replyTo('call:invite', () => ({ ok: false, error: 'Essa pessoa está em outra chamada' }))
    await expect(startCall('dm1')).rejects.toThrow('Essa pessoa está em outra chamada')
    expect(voice.join).not.toHaveBeenCalled()
  })

  it('atender: abre a conversa e entra na sala dela', async () => {
    socket.replyTo('call:accept', () => ({ ok: true, call: call({ status: 'active' }) }))
    socket.replyTo('message:history', () => ({ messages: [], hasMore: false }))
    await acceptCall('dm1')
    expect(useApp.getState()).toMatchObject({ section: 'home', homeView: { kind: 'dm', channelId: 'dm1' }, myVoiceChannelId: 'dm1' })
  })

  it('recusar, cancelar e desligar mandam o evento; erro do servidor vira exceção', async () => {
    socket.replyTo('call:decline', () => ({ ok: true }))
    socket.replyTo('call:cancel', () => ({ ok: true }))
    socket.replyTo('call:end', () => ({ ok: false, error: 'Nenhuma chamada nesta conversa' }))
    await declineCall('dm1')
    await cancelCall('dm1')
    await expect(hangUp('dm1')).rejects.toThrow('Nenhuma chamada nesta conversa')
    expect(socket.sent('call:decline')).toEqual([['dm1']])
    expect(socket.sent('call:cancel')).toEqual([['dm1']])
  })
})

describe('fim da chamada', () => {
  it('sai da sala da conversa na hora e avisa', () => {
    const teardown = vi.spyOn(voice, 'teardown').mockImplementation(() => {})
    useApp.setState({ myVoiceChannelId: 'dm1', calls: { dm1: call({ status: 'active' }) } })
    socket.receive('call:ended', ended('ended'))
    expect(teardown).toHaveBeenCalled()
    expect(useApp.getState()).toMatchObject({ myVoiceChannelId: null, calls: {} })
    expect(useApp.getState().notice?.text).toBe('Chamada encerrada.')
  })

  it('perdida (para quem recebe) e recusada (para quem ligou) usam o nome da pessoa', () => {
    socket.receive('call:ended', ended('missed'))
    expect(useApp.getState().notice?.text).toBe('Chamada perdida de Ana.')
    socket.receive('call:ended', ended('declined', 'eu'))
    expect(useApp.getState().notice?.text).toBe('Ana recusou a chamada.')
  })

  it('quem desligou não recebe aviso', async () => {
    socket.replyTo('call:end', () => ({ ok: true }))
    await hangUp('dm1')
    socket.receive('call:ended', ended('ended'))
    expect(useApp.getState().notice).toBeNull()
  })

  it('outra sala em que estou não é afetada', () => {
    const teardown = vi.spyOn(voice, 'teardown').mockImplementation(() => {})
    useApp.setState({ myVoiceChannelId: 'sala' })
    socket.receive('call:ended', ended('ended'))
    expect(teardown).not.toHaveBeenCalled()
    expect(useApp.getState().myVoiceChannelId).toBe('sala')
  })
})
