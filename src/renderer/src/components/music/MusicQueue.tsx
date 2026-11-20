import { Button } from '@ui-sdk/react/button'
import { ListMusic, Play, Shuffle } from 'lucide-react'
import type { MusicTrack } from '@shared/types'
import { jumpToTrack, shuffleMusic, trackDuration } from '@/lib/client'
import { CoverArt } from './CoverArt'
import { reportError } from './reportError'

const MUSIC_ERROR = 'Não foi possível falar com o bot de música'

interface QueueItemProps {
  channelId: string
  track: MusicTrack
  position: number
}

function QueueItem({ channelId, track, position }: QueueItemProps) {
  return (
    <li className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5">
      <span className="relative flex size-6 shrink-0 items-center justify-center">
        <span className="text-sm text-muted-foreground tabular-nums transition-opacity group-focus-within:opacity-0 group-hover:opacity-0">{position}</span>
        <Button
          aria-label={`Tocar agora: ${track.title}`}
          title="Tocar agora"
          pendingAnnouncement=""
          onClick={() => jumpToTrack(channelId, track.id).then(() => undefined, reportError(MUSIC_ERROR))}
          className="absolute inset-0 flex items-center justify-center rounded-full text-accent-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-pending:opacity-60 [&_svg]:size-4 [&_svg]:fill-current"
        >
          <Play aria-hidden />
        </Button>
      </span>
      <CoverArt track={track} className="size-10 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-accent-foreground" title={track.title}>
          {track.title}
          <span className="font-normal text-muted-foreground"> — {track.artists.join(', ')}</span>
        </p>
        <p className="truncate text-xs text-muted-foreground">pedida por {track.requestedBy.name}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{trackDuration(track.durationMs)}</span>
    </li>
  )
}

function ShuffleButton({ channelId, disabled }: { channelId: string; disabled: boolean }) {
  return (
    <Button
      aria-label="Embaralhar a fila"
      title="Embaralhar a fila"
      pendingAnnouncement=""
      disabled={disabled}
      onClick={() => shuffleMusic(channelId).then(() => undefined, reportError(MUSIC_ERROR))}
      className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-disabled:pointer-events-none data-disabled:opacity-40 data-pending:opacity-60 [&_svg]:size-4"
    >
      <Shuffle aria-hidden />
      Embaralhar
    </Button>
  )
}

export function MusicQueue({ channelId, queue }: { channelId: string; queue: MusicTrack[] }) {
  return (
    <section aria-labelledby="music-queue-heading" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-2">
        <h2 id="music-queue-heading" className="flex items-center gap-2 text-sm font-semibold text-accent-foreground">
          A seguir{' '}
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground tabular-nums">{queue.length}</span>
        </h2>
        <ShuffleButton channelId={channelId} disabled={queue.length < 2} />
      </div>
      {queue.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          <ListMusic aria-hidden className="size-5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">A fila está vazia</p>
            <p>Peça mais músicas pelo campo acima; elas tocam na ordem em que chegam.</p>
          </div>
        </div>
      ) : (
        <ol aria-label="Fila" className="flex flex-col">
          {queue.map((track, index) => (
            <QueueItem key={track.id} channelId={channelId} track={track} position={index + 1} />
          ))}
        </ol>
      )}
    </section>
  )
}
