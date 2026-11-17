import { useState } from 'react'
import type { MusicState, MusicTrack } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { closeMusicQueue, trackDuration } from '@/lib/client'
import { paginate } from '@/lib/paginate'
import { useApp } from '@/store'
import { TrackCover } from './MusicPlayer'

const PER_PAGE = 10

function TrackRow({ track, position }: { track: MusicTrack; position?: number }) {
  return (
    <div className="flex items-center gap-3">
      {position !== undefined && <span className="w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{position}</span>}
      <TrackCover track={track} className="size-10" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-accent-foreground" title={track.title}>
          {track.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">{track.artists.join(', ')}</p>
      </div>
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <p className="tabular-nums">{trackDuration(track.durationMs)}</p>
        <p className="max-w-28 truncate">Pedido por {track.requestedBy.name}</p>
      </div>
    </div>
  )
}

function QueuePages({ queue }: { queue: MusicTrack[] }) {
  const [page, setPage] = useState(1)
  if (!queue.length) return <p className="text-sm text-muted-foreground">Fila vazia.</p>
  const current = paginate(queue, page, PER_PAGE)
  return (
    <>
      <ol aria-label="Fila" className="flex flex-col gap-2">
        {current.items.map((track, i) => (
          <li key={`${current.start + i}-${track.id}`}>
            <TrackRow track={track} position={current.start + i + 1} />
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" disabled={current.page === 1} onClick={() => setPage(current.page - 1)}>
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground tabular-nums">
          Página {current.page} de {current.pages}
        </span>
        <Button variant="secondary" size="sm" disabled={current.page === current.pages} onClick={() => setPage(current.page + 1)}>
          Próxima
        </Button>
      </div>
    </>
  )
}

function QueueContent({ state }: { state: MusicState | undefined }) {
  if (!state?.nowPlaying) return <p className="text-sm text-muted-foreground">Nenhuma música tocando.</p>
  return (
    <>
      <section aria-label="Tocando agora" className="flex flex-col gap-2 rounded-lg bg-panel p-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tocando agora</p>
        <TrackRow track={state.nowPlaying} />
      </section>
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Na fila ({state.queue.length})</p>
      <QueuePages queue={state.queue} />
    </>
  )
}

export function MusicQueueDialog() {
  const channelId = useApp((s) => s.musicQueueChannelId)
  const state = useApp((s) => (channelId ? s.musicRooms[channelId] : undefined))
  return (
    <Dialog open={!!channelId} onOpenChange={(open) => !open && closeMusicQueue()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fila de músicas</DialogTitle>
          <DialogDescription>A música tocando agora e as próximas da sala.</DialogDescription>
        </DialogHeader>
        <QueueContent state={state} />
      </DialogContent>
    </Dialog>
  )
}
