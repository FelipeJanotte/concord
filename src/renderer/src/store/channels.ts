// Canais e o que está aberto no painel central.
import type { Channel } from '@shared/types'

export interface View {
  kind: 'text' | 'voice'
  channelId: string
}

export interface ChannelsState {
  channels: Channel[]
  /** bolinha de não lido por canal */
  unread: Record<string, boolean>
  view: View | null
}

export const channelsInitial: ChannelsState = {
  channels: [],
  unread: {},
  view: null
}
