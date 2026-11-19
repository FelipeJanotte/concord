import { ListMusic } from 'lucide-react'
import type { MusicTrack } from '@shared/types'
import { trackDuration } from '@/lib/client'
import { CoverArt } from './CoverArt'

function QueueItem({ track, position }: { track: MusicTrack; position: number }) {
  return (
    <li className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5">
      <span className="w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{position}</span>
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

export function MusicQueue({ queue }: { queue: MusicTrack[] }) {
  return (
    <section aria-labelledby="music-queue-heading" className="flex flex-col gap-2">
      <h2 id="music-queue-heading" className="flex items-center gap-2 px-2 text-sm font-semibold text-accent-foreground">
        A seguir{' '}
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground tabular-nums">{queue.length}</span>
      </h2>
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
            <QueueItem key={track.id} track={track} position={index + 1} />
          ))}
        </ol>
      )}
    </section>
  )
}
