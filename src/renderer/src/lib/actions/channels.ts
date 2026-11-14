// Canais: criar, apagar e abrir.
import type { Channel, ChannelType } from '@shared/types'
import type { View } from '@/store'
import { omit } from '../utils'
import { get, requireSocket, set, type AppSocket } from '../core'
import { loadHistory } from './messages'
import { leaveVoice } from './voice'

export function firstTextView(channels: Channel[]): View | null {
  const channel = channels.find((c) => c.type === 'text')
  return channel ? { kind: 'text', channelId: channel.id } : null
}

export function bindChannelEvents(s: AppSocket): void {
  s.on('channel:created', (channel) => set((st) => ({ channels: [...st.channels, channel] })))

  s.on('channel:deleted', (channelId) => {
    if (get().myVoiceChannelId === channelId) leaveVoice()
    set((st) => {
      const channels = st.channels.filter((c) => c.id !== channelId)
      return {
        channels,
        messages: omit(st.messages, channelId),
        unread: omit(st.unread, channelId),
        view: st.view?.channelId === channelId ? firstTextView(channels) : st.view
      }
    })
    const view = get().view
    if (view?.kind === 'text') void loadHistory(view.channelId)
  })
}

export function selectTextChannel(channelId: string): void {
  set((st) => ({ view: { kind: 'text', channelId }, unread: omit(st.unread, channelId) }))
  void loadHistory(channelId)
}

export async function createChannel(name: string, type: ChannelType): Promise<Channel> {
  const res = await requireSocket().emitWithAck('channel:create', { name, type })
  if (!res.ok) throw new Error(res.error)
  return res.channel
}

export function deleteChannel(channelId: string): void {
  requireSocket().emit('channel:delete', channelId)
}
