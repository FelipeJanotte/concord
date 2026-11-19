import { useEffect, useState } from 'react'
import { Progress, ProgressIndicator, ProgressTrack } from '@ui-sdk/react/progress'
import type { MusicState, MusicTrack } from '@shared/types'
import { trackDuration } from '@/lib/client'
import { playbackElapsedMs } from '@/lib/music-progress'
import { useApp } from '@/store'

const TICK_MS = 1000

function useNow(ticking: boolean, resyncKey: number): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    setNow(Date.now())
    if (!ticking) return
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(timer)
  }, [ticking, resyncKey])
  return now
}

interface PlaybackProgressProps {
  state: MusicState
  track: MusicTrack
}

export function PlaybackProgress({ state, track }: PlaybackProgressProps) {
  const syncedAt = useApp((s) => s.musicSyncedAt[state.channelId] ?? 0)
  const now = useNow(!state.paused, syncedAt)
  const elapsedMs = playbackElapsedMs(state, syncedAt, now)
  const elapsed = trackDuration(elapsedMs)
  const total = trackDuration(track.durationMs)

  return (
    <div className="flex flex-col gap-1.5">
      <Progress
        key={track.id}
        value={track.durationMs > 0 ? (elapsedMs / track.durationMs) * 100 : 0}
        aria-label="Progresso da música"
        getValueLabel={() => `${elapsed} de ${total}`}
      >
        <ProgressTrack className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <ProgressIndicator className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear motion-reduce:transition-none" />
        </ProgressTrack>
      </Progress>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{elapsed}</span>
        <span>{total}</span>
      </div>
    </div>
  )
}
