import { useEffect } from 'react'
import { Music2, SkipForward, Square } from 'lucide-react'
import { MUSIC_BOT_NAME } from '@shared/types'
import { loadMusicQueue, notify, skipMusic, stopMusic } from '@/lib/client'
import { useApp } from '@/store'

function minutes(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const reportError = (err: unknown): void => notify(err instanceof Error ? err.message : 'Não foi possível falar com o bot de música')

export function BotBadge() {
  return <span className="rounded bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">BOT</span>
}

export function MusicPlayer({ channelId }: { channelId: string }) {
  const state = useApp((s) => s.musicRooms[channelId])
  const inRoom = useApp((s) => s.myVoiceChannelId === channelId)

  useEffect(() => {
    loadMusicQueue(channelId).catch(() => {})
  }, [channelId])

  const track = state?.nowPlaying
  if (!track) return null

  return (
    <section aria-label="Tocando agora" className="mx-auto mb-3 flex w-full max-w-xl items-center gap-3 rounded-lg bg-panel p-3">
      {track.coverUrl ? (
        <img src={track.coverUrl} alt={`Capa de ${track.title}`} className="size-16 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
          <Music2 className="size-7" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tocando agora</p>
        <p className="truncate font-semibold text-accent-foreground" title={track.title}>
          {track.title}
        </p>
        <p className="truncate text-sm text-muted-foreground">{track.artists.join(', ')}</p>
        <p className="truncate text-xs text-muted-foreground">
          Pedido por {track.requestedBy.name} · {minutes(track.durationMs)}
          {state.queue.length > 0 && ` · ${state.queue.length} na fila`}
        </p>
      </div>
      {inRoom && (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => skipMusic(channelId).catch(reportError)}
            aria-label="Pular música"
            title="Pular música"
            className="rounded-md p-2 text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground [&_svg]:size-5"
          >
            <SkipForward />
          </button>
          <button
            type="button"
            onClick={() => stopMusic(channelId).catch(reportError)}
            aria-label="Parar a música"
            title="Parar a música"
            className="rounded-md p-2 text-muted-foreground hover:bg-accent/50 hover:text-destructive [&_svg]:size-5"
          >
            <Square />
          </button>
        </div>
      )}
    </section>
  )
}

export function MusicBotMember({ channelId }: { channelId: string }) {
  const playing = useApp((s) => !!s.musicRooms[channelId]?.nowPlaying)
  if (!playing) return null
  return (
    <div className="flex h-7 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground" data-testid="music-bot">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Music2 className="size-3.5" />
      </span>
      <span className="flex-1 truncate">{MUSIC_BOT_NAME}</span>
      <BotBadge />
    </div>
  )
}
