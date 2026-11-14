// Canais de texto e de voz.

export type ChannelType = 'text' | 'voice'

export interface Channel {
  id: string
  name: string
  type: ChannelType
  createdAt: number
}

export type CreateChannelResult = { ok: true; channel: Channel } | { ok: false; error: string }

// ---------- Eventos ----------

export interface ChannelServerEvents {
  'channel:created': (channel: Channel) => void
  'channel:deleted': (channelId: string) => void
}

export interface ChannelClientEvents {
  'channel:create': (payload: { name: string; type: ChannelType }, ack: (res: CreateChannelResult) => void) => void
  'channel:delete': (channelId: string) => void
}
