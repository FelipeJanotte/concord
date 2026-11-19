export interface ChannelReadState {
  channelId: string
  lastReadId: string | null
  unread: boolean
}

export interface ChannelRead {
  channelId: string
  messageId: string
}

export type ChannelReadResult = { ok: true } | { ok: false; error: string }

export interface ReadsServerEvents {
  'channel:read-sync': (read: ChannelRead) => void
}

export interface ReadsClientEvents {
  'channel:reads': (ack: (reads: ChannelReadState[]) => void) => void
  'channel:read': (read: ChannelRead, ack: (res: ChannelReadResult) => void) => void
}
