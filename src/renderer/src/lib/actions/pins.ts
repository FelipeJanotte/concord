import type { Message, MessagePinned } from '@shared/types'
import { omit } from '../utils'
import { requireSocket, set, type AppSocket } from '../core'

function withPin({ pinnedAt: _old, ...message }: Message, pinnedAt: number | null): Message {
  return pinnedAt === null ? message : { ...message, pinnedAt }
}

function updatedPins(pins: Message[] | undefined, { messageId, pinnedAt }: MessagePinned, loaded: Message | undefined): Message[] | undefined {
  if (!pins) return undefined
  const others = pins.filter((m) => m.id !== messageId)
  if (pinnedAt === null) return others
  return loaded ? [withPin(loaded, pinnedAt), ...others] : undefined
}

function applyPinned(event: MessagePinned): void {
  const { channelId, messageId, pinnedAt } = event
  set((st) => {
    const list = st.messages[channelId]
    const loaded = list?.find((m) => m.id === messageId)
    const pins = updatedPins(st.pins[channelId], event, loaded)
    return {
      pins: pins ? { ...st.pins, [channelId]: pins } : omit(st.pins, channelId),
      messages: list && loaded ? { ...st.messages, [channelId]: list.map((m) => (m.id === messageId ? withPin(m, pinnedAt) : m)) } : st.messages
    }
  })
}

export function bindPinsEvents(s: AppSocket): void {
  s.on('message:pinned', applyPinned)
  s.on('message:deleted', ({ channelId, messageId }) =>
    set((st) => {
      const pins = st.pins[channelId]
      return pins ? { pins: { ...st.pins, [channelId]: pins.filter((m) => m.id !== messageId) } } : {}
    })
  )
}

export async function loadPins(channelId: string): Promise<void> {
  const pins = await requireSocket().emitWithAck('message:pins', { channelId })
  set((st) => ({ pins: { ...st.pins, [channelId]: pins } }))
}

export async function pinMessage(messageId: string, on: boolean): Promise<void> {
  const res = await requireSocket().emitWithAck('message:pin', { messageId, on })
  if (!res.ok) throw new Error(res.error)
}
