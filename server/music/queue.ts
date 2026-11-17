import { MUSIC_QUEUE_MAX, type MusicTrack } from '../../src/shared/types'

export interface RoomQueue {
  nowPlaying: MusicTrack | null
  upcoming: MusicTrack[]
}

export const EMPTY_QUEUE: RoomQueue = { nowPlaying: null, upcoming: [] }

export type EnqueueResult = { ok: true; queue: RoomQueue } | { ok: false; error: string }

export function enqueue(queue: RoomQueue, track: MusicTrack, max = MUSIC_QUEUE_MAX): EnqueueResult {
  if (!queue.nowPlaying) return { ok: true, queue: { nowPlaying: track, upcoming: queue.upcoming } }
  if (queue.upcoming.length >= max) return { ok: false, error: `A fila está cheia (máximo de ${max} músicas)` }
  return { ok: true, queue: { nowPlaying: queue.nowPlaying, upcoming: [...queue.upcoming, track] } }
}

export function advance(queue: RoomQueue): RoomQueue {
  const [next = null, ...rest] = queue.upcoming
  return { nowPlaying: next, upcoming: rest }
}
