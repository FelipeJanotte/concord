// Canais: criar, apagar e abrir.
import type { Channel, ChannelType } from '@shared/types'
import type { View } from '@/store'
import { omit } from '../utils'
import { get, requireSocket, set, type AppSocket } from '../core'
import { loadHistory } from './messages'
import { clearDraft } from './uploads'
import { leaveVoice } from './voice'

export function firstTextView(channels: Channel[]): View | null {
  const channel = channels.find((c) => c.type === 'text')
  return channel ? { kind: 'text', channelId: channel.id } : null
}

/**
 * Troca a lista de canais e limpa o que era dos canais que saíram (apagados ou
 * que a pessoa deixou de poder ver): rascunho, histórico, não lidos, voz e a tela aberta.
 */
function replaceChannels(next: Channel[]): void {
  const keep = new Set(next.map((c) => c.id))
  const gone = get()
    .channels.map((c) => c.id)
    .filter((id) => !keep.has(id))
  if (gone.includes(get().myVoiceChannelId ?? '')) leaveVoice()
  for (const id of gone) clearDraft(id)
  set((st) => {
    const drop = <T>(record: Record<string, T>): Record<string, T> => gone.reduce((r, id) => omit(r, id), record)
    return {
      channels: next,
      messages: drop(st.messages),
      hasMoreHistory: drop(st.hasMoreHistory),
      loadingOlder: drop(st.loadingOlder),
      unread: drop(st.unread),
      view: st.view && !keep.has(st.view.channelId) ? firstTextView(next) : st.view
    }
  })
  const view = get().view
  if (view?.kind === 'text') void loadHistory(view.channelId)
}

export function bindChannelEvents(s: AppSocket): void {
  s.on('channel:created', (channel) => set((st) => ({ channels: [...st.channels, channel] })))

  s.on('channel:deleted', (channelId) => replaceChannels(get().channels.filter((c) => c.id !== channelId)))

  // permissões mudaram: canais que a pessoa pode ver agora (v2)
  s.on('channels:visible', (channels) => replaceChannels(channels))
}

export function selectTextChannel(channelId: string): void {
  set((st) => ({ section: 'community', view: { kind: 'text', channelId }, unread: omit(st.unread, channelId) }))
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
