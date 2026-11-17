import type { MusicState } from '@shared/types'

export interface MusicSliceState {
  musicRooms: Record<string, MusicState>
  musicQueueChannelId: string | null
}

export const musicInitial: MusicSliceState = {
  musicRooms: {},
  musicQueueChannelId: null
}
