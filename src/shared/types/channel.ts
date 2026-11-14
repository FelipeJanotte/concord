// Canais de texto e de voz (e, na v3, conversas privadas).

/** Tipos de canal da comunidade (os únicos que dá para criar com `channel:create`). */
export type ChannelType = 'text' | 'voice'
/** Todos os tipos: `dm` é a conversa privada entre duas contas (v3, skill `concord-dms`). */
export type ChannelKind = ChannelType | 'dm'

export interface Channel {
  id: string
  name: string
  type: ChannelKind
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
