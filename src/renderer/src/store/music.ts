import type { MusicCollection, MusicState } from '@shared/types'

export interface RoomCollection {
  channelId: string
  collection: MusicCollection
}

export interface MusicSliceState {
  musicRooms: Record<string, MusicState>
  musicSyncedAt: Record<string, number>
  musicQueueChannelId: string | null
  roomCollection: RoomCollection | null
}

export const musicInitial: MusicSliceState = {
  musicRooms: {},
  musicSyncedAt: {},
  musicQueueChannelId: null,
  roomCollection: null
}
