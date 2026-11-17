import type { MusicState } from '@shared/types'

export interface MusicSliceState {
  musicRooms: Record<string, MusicState>
}

export const musicInitial: MusicSliceState = {
  musicRooms: {}
}
