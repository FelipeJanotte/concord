import type { ChannelReadState } from '@shared/types'
import { omit } from '../utils'
import { get, getSocket, requireSocket, set, type AppSocket } from '../core'
import { loadHistory } from './messages'
import { isChatOnScreen } from './navigation'

export function bindReadsEvents(s: AppSocket): void {
  s.on('channel:read-sync', ({ channelId, messageId }) =>
    set((st) => ({ unread: omit(st.unread, channelId), mentioned: omit(st.mentioned, channelId), lastRead: { ...st.lastRead, [channelId]: messageId } }))
  )

  s.on('message:new', (message) => {
    if (isChatOnScreen(get(), message.channelId)) markRead(message.channelId)
  })
}

export async function loadReads(): Promise<void> {
  const reads = await requireSocket().emitWithAck('channel:reads')
  set((st) => ({
    lastRead: { ...lastReadFrom(reads), ...st.lastRead },
    unread: { ...unreadFrom(reads, st.mutedChannels), ...st.unread }
  }))
  const onScreen = reads.find((r) => r.unread && isChatOnScreen(get(), r.channelId))
  if (onScreen) startReading(onScreen.channelId)
}

function lastReadFrom(reads: ChannelReadState[]): Record<string, string> {
  return Object.fromEntries(reads.flatMap((r) => (r.lastReadId ? [[r.channelId, r.lastReadId]] : [])))
}

function unreadFrom(reads: ChannelReadState[], muted: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(reads.filter((r) => r.unread && !muted.includes(r.channelId)).map((r) => [r.channelId, true]))
}

export function startReading(channelId: string): void {
  set((st) => {
    const marker = st.unread[channelId] ? st.lastRead[channelId] : undefined
    return {
      unread: omit(st.unread, channelId),
      mentioned: omit(st.mentioned, channelId),
      readMarker: marker ? { ...st.readMarker, [channelId]: marker } : omit(st.readMarker, channelId)
    }
  })
  void loadHistory(channelId).then(() => markRead(channelId))
}

function markRead(channelId: string): void {
  const socket = getSocket()
  const st = get()
  const last = st.messages[channelId]?.at(-1)
  if (!socket || !last || st.lastRead[channelId] === last.id) return
  set({ lastRead: { ...st.lastRead, [channelId]: last.id } })
  socket.emit('channel:read', { channelId, messageId: last.id }, () => {})
}
