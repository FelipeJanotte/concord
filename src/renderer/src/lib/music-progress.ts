import type { MusicState } from '@shared/types'

export function playbackElapsedMs(state: MusicState, syncedAt: number, now: number): number {
  const duration = state.nowPlaying?.durationMs ?? 0
  const sinceSync = state.paused ? 0 : Math.max(0, now - syncedAt)
  return Math.min(duration, state.elapsedMs + sinceSync)
}
