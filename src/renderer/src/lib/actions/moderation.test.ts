// Ações de moderação (B6): mensagem apagada, expulsão da voz e os avisos de quem foi silenciado.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, Message, User, VoiceState } from '@shared/types'
import { deleteMessage, kickFromVoice, setServerMuted, bindModerationEvents } from '@/lib/actions/moderation'
import { bindVoiceEvents, toggleMute } from '@/lib/actions/voice'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const sala: Channel = { id: 'sala', name: 'Sala', type: 'voice', createdAt: 0 }
const msg = (id: string): Message => ({ id, channelId: 'geral', author: me, content: id, attachments: [], createdAt: 0 })
const state = (over: Partial<VoiceState> = {}): VoiceState => ({
  userId: me.id,
  channelId: 'sala',
  muted: false,
  deafened: false,
  sharing: false,
  ...over
})

let socket: FakeSocket

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindVoiceEvents(socket.asSocket())
  bindModerationEvents(socket.asSocket())
  useApp.setState({ ...initialState, self: me, channels: [sala], messages: { geral: [msg('a'), msg('b')] } })
})

afterEach(() => {
  setSocket(null)
  vi.restoreAllMocks()
})

describe('message:deleted', () => {
  it('tira a mensagem da lista do canal', () => {
    socket.receive('message:deleted', { channelId: 'geral', messageId: 'a' })
    expect(useApp.getState().messages.geral.map((m) => m.id)).toEqual(['b'])
  })

  it('canal que não está carregado ou mensagem que não está na lista: nada muda', () => {
    const before = useApp.getState().messages
    socket.receive('message:deleted', { channelId: 'outro', messageId: 'a' })
    socket.receive('message:deleted', { channelId: 'geral', messageId: 'zzz' })
    expect(useApp.getState().messages).toBe(before)
  })
})

describe('moderation:kicked', () => {
  it('sai da sala na hora e diz quem expulsou; o voice:state seguinte não avisa de novo', () => {
    const teardown = vi.spyOn(voice, 'teardown').mockImplementation(() => {})
    useApp.setState({ myVoiceChannelId: 'sala' })
    socket.receive('moderation:kicked', { channelId: 'sala', by: 'Dona' })
    expect(teardown).toHaveBeenCalled()
    expect(useApp.getState().myVoiceChannelId).toBeNull()
    expect(useApp.getState().notice?.text).toBe('Dona tirou você da sala de voz.')
    socket.receive('voice:state', [])
    expect(useApp.getState().notice?.text).toBe('Dona tirou você da sala de voz.')
  })

  it('de outra sala (já troquei): ignora', () => {
    const teardown = vi.spyOn(voice, 'teardown').mockImplementation(() => {})
    useApp.setState({ myVoiceChannelId: 'outra' })
    socket.receive('moderation:kicked', { channelId: 'sala', by: 'Dona' })
    expect(teardown).not.toHaveBeenCalled()
    expect(useApp.getState().myVoiceChannelId).toBe('outra')
  })
})

describe('silenciado por um moderador', () => {
  it('apertar o microfone diz que foi um moderador', () => {
    useApp.setState({ myVoiceChannelId: 'sala', voiceCanSpeak: false })
    socket.receive('voice:state', [state({ muted: true, serverMuted: true })])
    toggleMute()
    expect(useApp.getState().notice?.text).toBe('Um moderador silenciou você nas salas de voz.')
  })

  it('perder a fala por moderador (LiveKit) usa o mesmo aviso; sem moderador, o aviso comum', () => {
    useApp.setState({ myVoiceChannelId: 'sala', voiceCanSpeak: true })
    socket.receive('voice:state', [state({ muted: true, serverMuted: true })])
    voice.onPermissionsChange?.({ canSpeak: false, canShare: true })
    expect(useApp.getState().notice?.text).toBe('Um moderador silenciou você nas salas de voz.')

    useApp.setState({ voiceCanSpeak: true })
    socket.receive('voice:state', [state({ serverMuted: false })])
    voice.onPermissionsChange?.({ canSpeak: false, canShare: true })
    expect(useApp.getState().notice?.text).toBe('Você não pode mais falar nesta sala.')
  })
})

describe('ações', () => {
  it('mandam o pedido certo e viram exceção com o erro do servidor', async () => {
    socket.replyTo('moderation:voice-kick', () => ({ ok: true }))
    socket.replyTo('moderation:voice-mute', () => ({ ok: false, error: 'Você não pode silenciar essa pessoa' }))
    socket.replyTo('message:delete', () => ({ ok: true }))

    await kickFromVoice('sock-ana')
    expect(socket.sent('moderation:voice-kick')[0][0]).toEqual({ userId: 'sock-ana' })
    await expect(setServerMuted('acc-ana', true)).rejects.toThrow('Você não pode silenciar essa pessoa')
    expect(socket.sent('moderation:voice-mute')[0][0]).toEqual({ accountId: 'acc-ana', muted: true })
    await deleteMessage('m1')
    expect(socket.sent('message:delete')[0][0]).toEqual({ messageId: 'm1' })
  })
})
