import type { Message, MessageEmbedUpdate } from '@shared/types'
import { requireSocket, set, type AppSocket } from '../core'
import { runMusicCommand } from './music'

function withEmbed({ embed: _old, ...message }: Message, embed: MessageEmbedUpdate['embed']): Message {
  return embed ? { ...message, embed } : message
}

function applyEmbed({ channelId, messageId, embed }: MessageEmbedUpdate): void {
  set((st) => {
    const list = st.messages[channelId]
    if (!list?.some((m) => m.id === messageId)) return {}
    return { messages: { ...st.messages, [channelId]: list.map((m) => (m.id === messageId ? withEmbed(m, embed) : m)) } }
  })
}

export function bindEmbedEvents(s: AppSocket): void {
  s.on('message:embed', applyEmbed)
}

export async function removeEmbed(messageId: string): Promise<void> {
  const res = await requireSocket().emitWithAck('message:embed-remove', { messageId })
  if (!res.ok) throw new Error(res.error)
}

export function playEmbedInBot(url: string, textChannelId: string): Promise<boolean> {
  return runMusicCommand(`/play ${url}`, textChannelId) ?? Promise.resolve(false)
}
