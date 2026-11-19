// @vitest-environment jsdom
// Ações de moderação (B6): mensagem apagada, expulsão da voz e os avisos de quem foi silenciado.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, Message, User, VoiceState } from '@shared/types'
import {
  banFromCommunity,
  bindModerationEvents,
  deleteMessage,
  kickFromCommunity,
  kickFromVoice,
  loadBans,
  loadTimeouts,
  moveToVoice,
  setServerMuted,
  timeoutMember,
  unbanFromCommunity
} from '@/lib/actions/moderation'
import { bindVoiceEvents, toggleMute } from '@/lib/actions/voice'
import { setSocket, TOKEN_KEY } from '@/lib/core'
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
let signOut: ReturnType<typeof vi.fn<() => void>>

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindVoiceEvents(socket.asSocket())
  signOut = vi.fn<() => void>(() => useApp.setState({ self: null }))
  bindModerationEvents(socket.asSocket(), signOut)
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
    voice.onPermissionsChange?.({ canSpeak: false, canShare: true, canVideo: true })
    expect(useApp.getState().notice?.text).toBe('Um moderador silenciou você nas salas de voz.')

    useApp.setState({ voiceCanSpeak: true })
    socket.receive('voice:state', [state({ serverMuted: false })])
    voice.onPermissionsChange?.({ canSpeak: false, canShare: true, canVideo: true })
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

describe('mover para outra sala', () => {
  const outra: Channel = { id: 'outra', name: 'Jogos', type: 'voice', createdAt: 0 }

  it('moderation:moved troca de sala, diz quem moveu e para onde; olhando a sala antiga, a tela acompanha', async () => {
    const join = vi.spyOn(voice, 'join').mockResolvedValue({ micError: null, cancelled: false, canSpeak: true, canShare: true, canVideo: true })
    useApp.setState({ channels: [sala, outra], myVoiceChannelId: 'sala', section: 'community', view: { kind: 'voice', channelId: 'sala' } })
    socket.receive('moderation:moved', { channelId: 'outra', by: 'Dona' })
    expect(useApp.getState().notice?.text).toBe('Dona levou você para Jogos.')
    await vi.waitFor(() => expect(useApp.getState().myVoiceChannelId).toBe('outra'))
    expect(join).toHaveBeenCalledWith('outra')
    expect(useApp.getState().view).toEqual({ kind: 'voice', channelId: 'outra' })
  })

  it('no chat de texto: a voz troca e a tela fica onde estava', async () => {
    vi.spyOn(voice, 'join').mockResolvedValue({ micError: null, cancelled: false, canSpeak: true, canShare: true, canVideo: true })
    useApp.setState({ channels: [sala, outra], myVoiceChannelId: 'sala', section: 'community', view: { kind: 'text', channelId: 'geral' } })
    socket.receive('moderation:moved', { channelId: 'outra', by: 'Dona' })
    await vi.waitFor(() => expect(useApp.getState().myVoiceChannelId).toBe('outra'))
    expect(useApp.getState().view).toEqual({ kind: 'text', channelId: 'geral' })
  })

  it('fora da voz, ou já na sala de destino: ignora', () => {
    const join = vi.spyOn(voice, 'join')
    socket.receive('moderation:moved', { channelId: 'outra', by: 'Dona' })
    useApp.setState({ myVoiceChannelId: 'outra' })
    socket.receive('moderation:moved', { channelId: 'outra', by: 'Dona' })
    expect(join).not.toHaveBeenCalled()
  })

  it('moveToVoice manda o pedido e vira exceção com o erro do servidor', async () => {
    socket.replyTo('moderation:voice-move', () => ({ ok: false, error: 'Você não pode mover essa pessoa' }))
    await expect(moveToVoice('sock-ana', 'outra')).rejects.toThrow('Você não pode mover essa pessoa')
    expect(socket.sent('moderation:voice-move')).toEqual([[{ userId: 'sock-ana', channelId: 'outra' }]])
  })
})

describe('moderation:removed', () => {
  beforeEach(() => localStorage.setItem(TOKEN_KEY, 'token'))

  it('expulso: esquece a sessão, sai do servidor e diz quem expulsou', () => {
    socket.receive('moderation:removed', { kind: 'kick', by: 'Dona' })
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(signOut).toHaveBeenCalledOnce()
    expect(useApp.getState().self).toBeNull()
    expect(useApp.getState().notice?.text).toBe('Dona expulsou você da comunidade. Você pode entrar de novo.')
  })

  it('banido: avisa com o motivo, ou sem ele', () => {
    socket.receive('moderation:removed', { kind: 'ban', reason: 'spam' })
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(useApp.getState().notice?.text).toBe('Você foi banido desta comunidade. Motivo: spam')
    socket.receive('moderation:removed', { kind: 'ban', reason: null })
    expect(useApp.getState().notice?.text).toBe('Você foi banido desta comunidade.')
  })
})

describe('castigo', () => {
  it('moderation:timeout-changed guarda e tira o prazo da conta', () => {
    socket.receive('moderation:timeout-changed', { accountId: 'acc-eu', until: 123 })
    socket.receive('moderation:timeout-changed', { accountId: 'acc-ana', until: 456 })
    expect(useApp.getState().timeouts).toEqual({ 'acc-eu': 123, 'acc-ana': 456 })
    socket.receive('moderation:timeout-changed', { accountId: 'acc-eu', until: null })
    expect(useApp.getState().timeouts).toEqual({ 'acc-ana': 456 })
  })

  it('loadTimeouts troca a lista pelo que o servidor diz', async () => {
    useApp.setState({ timeouts: { velho: 1 } })
    socket.replyTo('moderation:timeouts', () => [{ accountId: 'acc-ana', until: 99 }])
    await loadTimeouts()
    expect(useApp.getState().timeouts).toEqual({ 'acc-ana': 99 })
  })

  it('timeoutMember manda os minutos e vira exceção no erro', async () => {
    socket.replyTo('moderation:timeout', () => ({ ok: false, error: 'Você não pode pôr essa pessoa de castigo' }))
    await expect(timeoutMember('acc-ana', 10)).rejects.toThrow('Você não pode pôr essa pessoa de castigo')
    expect(socket.emitted.at(-1)).toMatchObject({ event: 'moderation:timeout', args: [{ accountId: 'acc-ana', minutes: 10 }] })
  })
})

describe('expulsar e banir', () => {
  it('mandam a conta (e o motivo) e viram exceção no erro', async () => {
    socket.replyTo('moderation:kick', () => ({ ok: true }))
    socket.replyTo('moderation:ban', () => ({ ok: false, error: 'Você não pode banir essa pessoa' }))
    socket.replyTo('moderation:unban', () => ({ ok: true }))
    await kickFromCommunity('acc-ana')
    await expect(banFromCommunity('acc-ana', 'spam')).rejects.toThrow('Você não pode banir essa pessoa')
    await unbanFromCommunity('acc-ana')
    expect(socket.emitted.slice(-3)).toMatchObject([
      { event: 'moderation:kick', args: [{ accountId: 'acc-ana' }] },
      { event: 'moderation:ban', args: [{ accountId: 'acc-ana', reason: 'spam' }] },
      { event: 'moderation:unban', args: [{ accountId: 'acc-ana' }] }
    ])
  })

  it('loadBans devolve a lista ou a exceção do servidor', async () => {
    const ban = { accountId: 'acc-ana', name: 'Ana', tag: 'ana', reason: null, createdAt: 1 }
    socket.replyTo('moderation:bans', () => ({ ok: true, bans: [ban] }))
    expect(await loadBans()).toEqual([ban])
    socket.replyTo('moderation:bans', () => ({ ok: false, error: 'Você não pode ver os banimentos' }))
    await expect(loadBans()).rejects.toThrow('Você não pode ver os banimentos')
  })
})
