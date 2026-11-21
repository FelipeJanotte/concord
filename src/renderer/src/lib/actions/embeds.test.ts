import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Message, User } from '@shared/types'
import { bindEmbedEvents, playEmbedInBot, removeEmbed } from '@/lib/actions/embeds'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const ana: User = { id: 'sock-ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const msg = (id: string, over: Partial<Message> = {}): Message => ({ id, channelId: 'geral', author: ana, content: id, attachments: [], createdAt: 1, ...over })
const embed = { url: 'https://a.com/', title: 'A' }

let socket: FakeSocket
const st = () => useApp.getState()

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindEmbedEvents(socket.asSocket())
  useApp.setState({ ...initialState, messages: { geral: [msg('m1'), msg('m2')] } })
})
afterEach(() => setSocket(null))

describe('prévia de links no app', () => {
  it('message:embed põe e tira a prévia da mensagem carregada', () => {
    socket.receive('message:embed', { channelId: 'geral', messageId: 'm1', embed })
    expect(st().messages.geral[0].embed).toEqual(embed)
    expect(st().messages.geral[1].embed).toBeUndefined()
    socket.receive('message:embed', { channelId: 'geral', messageId: 'm1', embed: null })
    expect(st().messages.geral[0]).not.toHaveProperty('embed')
  })

  it('canal não carregado: nada muda', () => {
    const before = st().messages
    socket.receive('message:embed', { channelId: 'outro', messageId: 'x', embed })
    expect(st().messages).toBe(before)
  })

  it('removeEmbed manda o pedido e lança o erro do servidor', async () => {
    socket.replyTo('message:embed-remove', () => ({ ok: false, error: 'Você só pode remover a prévia das suas mensagens' }))
    await expect(removeEmbed('m1')).rejects.toThrow('Você só pode remover a prévia das suas mensagens')
    expect(socket.sent('message:embed-remove')[0][0]).toEqual({ messageId: 'm1' })
  })

  it('playEmbedInBot usa o /play do bot na sala onde estou, respondendo no chat da mensagem', async () => {
    useApp.setState({ myVoiceChannelId: 'sala' })
    socket.replyTo('music:play', () => ({ ok: true, state: { channelId: 'sala', nowPlaying: null, queue: [], paused: false, elapsedMs: 0 } }))
    expect(await playEmbedInBot('https://youtu.be/dQw4w9WgXcQ', 'geral')).toBe(true)
    expect(socket.sent('music:play')[0][0]).toEqual({ channelId: 'sala', query: 'https://youtu.be/dQw4w9WgXcQ', textChannelId: 'geral' })
  })
})
