import { Disc3 } from 'lucide-react'
import type { MusicState, MusicTrack } from '@shared/types'
import { cn } from '@/lib/utils'
import { CoverArt } from './CoverArt'
import { MusicVolumeSlider } from './MusicVolumeSlider'
import { PlaybackControls } from './PlaybackControls'
import { PlaybackProgress } from './PlaybackProgress'

function PlayingBars({ paused }: { paused: boolean }) {
  return (
    <span aria-hidden className="flex h-3 items-end gap-0.5">
      {['h-1.5', 'h-3 [animation-delay:180ms]', 'h-2 [animation-delay:360ms]'].map((bar) => (
        <span key={bar} className={cn('w-0.5 rounded-full bg-primary', bar, !paused && 'animate-pulse motion-reduce:animate-none')} />
      ))}
    </span>
  )
}

function CoverGlow({ track }: { track: MusicTrack }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {track.coverUrl ? (
        <img src={track.coverUrl} alt="" className="size-full scale-125 object-cover opacity-35 blur-3xl saturate-150" />
      ) : (
        <div className="size-full bg-gradient-to-br from-primary/35 via-transparent to-transparent" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/70 to-transparent" />
    </div>
  )
}

interface NowPlayingProps {
  state: MusicState
  track: MusicTrack
}

export function NowPlaying({ state, track }: NowPlayingProps) {
  return (
    <section aria-label="Tocando agora" className="relative overflow-hidden rounded-2xl border border-border/60 bg-panel shadow-xl">
      <CoverGlow track={track} />
      <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-end">
        <CoverArt
          track={track}
          className={cn(
            'size-40 self-center rounded-xl shadow-2xl ring-1 ring-foreground/10 transition-[opacity,scale] duration-300 sm:size-48 sm:self-auto',
            state.paused && 'scale-[0.97] opacity-70'
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-4">
              <h2 className="min-w-0 flex-1 truncate text-2xl leading-tight font-bold text-accent-foreground sm:text-3xl" title={track.title}>
                {track.title}
              </h2>
              <p className="flex shrink-0 items-center gap-2 text-xs font-semibold tracking-widest text-primary uppercase">
                <PlayingBars paused={state.paused} />
                {state.paused ? 'Pausada' : 'Tocando agora'}
              </p>
            </div>
            <p className="mt-1 truncate text-sm text-foreground/80">{track.artists.join(', ')}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">pedida por {track.requestedBy.name}</p>
          </div>
          <PlaybackProgress state={state} track={track} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PlaybackControls channelId={state.channelId} paused={state.paused} />
            <MusicVolumeSlider className="w-28" />
          </div>
        </div>
      </div>
    </section>
  )
}

export function NothingPlaying() {
  return (
    <section aria-label="Nada tocando" className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-panel/60 px-6 py-12 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-primary/5 text-primary">
        <Disc3 aria-hidden className="size-8" />
      </span>
      <p className="text-lg font-semibold text-accent-foreground">Nada tocando agora</p>
      <p className="max-w-sm text-sm text-muted-foreground">Cole um link do Spotify ou do YouTube abaixo, ou digite o nome da música, e ela começa na hora.</p>
    </section>
  )
}
