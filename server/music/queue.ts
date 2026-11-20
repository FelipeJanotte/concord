import { MUSIC_QUEUE_MAX } from '../../src/shared/types'
import type { QueuedTrack } from './ports'

export interface RoomQueue {
  nowPlaying: QueuedTrack | null
  upcoming: QueuedTrack[]
}

export const EMPTY_QUEUE: RoomQueue = { nowPlaying: null, upcoming: [] }

export type EnqueueResult = { ok: true; queue: RoomQueue; added: number } | { ok: false; error: string }

export function enqueue(queue: RoomQueue, tracks: QueuedTrack[], max = MUSIC_QUEUE_MAX): EnqueueResult {
  const [first, ...rest] = tracks
  const nowPlaying = queue.nowPlaying ?? first ?? null
  const waiting = queue.nowPlaying ? tracks : rest
  const accepted = waiting.slice(0, Math.max(0, max - queue.upcoming.length))
  const added = accepted.length + (queue.nowPlaying || !first ? 0 : 1)
  if (!added) return { ok: false, error: `A fila está cheia (máximo de ${max} músicas)` }
  return { ok: true, queue: { nowPlaying, upcoming: [...queue.upcoming, ...accepted] }, added }
}

export function advance(queue: RoomQueue): RoomQueue {
  const [next = null, ...rest] = queue.upcoming
  return { nowPlaying: next, upcoming: rest }
}

export function jumpTo(queue: RoomQueue, trackId: string): RoomQueue | null {
  const index = queue.upcoming.findIndex((t) => t.id === trackId)
  if (index < 0) return null
  return { nowPlaying: queue.upcoming[index], upcoming: queue.upcoming.slice(index + 1) }
}

export type RandomIndex = (max: number) => number

export function shuffleUpcoming(queue: RoomQueue, randomIndex: RandomIndex): RoomQueue {
  const upcoming = [...queue.upcoming]
  for (let i = upcoming.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1)
    ;[upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]]
  }
  return { nowPlaying: queue.nowPlaying, upcoming }
}
