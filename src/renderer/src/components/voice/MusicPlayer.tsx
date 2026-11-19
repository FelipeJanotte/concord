import { useEffect, useState, type ComponentProps } from 'react'
import { ChevronDown, ChevronUp, ListMusic, Music2, Pause, Play, SkipForward, Square, VolumeX } from 'lucide-react'
import { MUSIC_BOT_NAME, type MusicTrack } from '@shared/types'
import { loadMusicQueue, notify, openMusicQueue, pauseMusic, resumeMusic, skipMusic, stopMusic, trackDuration } from '@/lib/client'
import { loadPlayerHidden, savePlayerHidden } from '@/lib/music-player'
import { cn } from '@/lib/utils'
import { MUSIC_BOT_VOLUME_ID } from '@/lib/voice'
import { useApp } from '@/store'
import { MusicVolumeSlider } from '@/components/music/MusicVolumeSlider'
import { MusicBotContextMenu } from './MemberContextMenu'

const reportError = (err: unknown): void => notify(err instanceof Error ? err.message : 'Não foi possível falar com o bot de música')

export function BotBadge() {
  return <span className="rounded bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">BOT</span>
}

export function TrackCover({ track, className }: { track: Pick<MusicTrack, 'title' | 'coverUrl'>; className: string }) {
  if (track.coverUrl) return <img src={track.coverUrl} alt={`Capa de ${track.title}`} className={cn('shrink-0 rounded-md object-cover', className)} />
  return (
    <div className={cn('flex shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground', className)}>
      <Music2 className="size-1/2" />
    </div>
  )
}

function PlayerButton({ label, className, ...props }: ComponentProps<'button'> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn('rounded-md p-2 text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground [&_svg]:size-5', className)}
      {...props}
    />
  )
}

export function MusicPlayer({ channelId }: { channelId: string }) {
  const state = useApp((s) => s.musicRooms[channelId])
  const inRoom = useApp((s) => s.myVoiceChannelId === channelId)
  const [hidden, setHidden] = useState(loadPlayerHidden)

  useEffect(() => {
    loadMusicQueue(channelId).catch(reportError)
  }, [channelId])

  function changeHidden(next: boolean): void {
    setHidden(next)
    savePlayerHidden(next)
  }

  const track = state?.nowPlaying
  if (!track) return null

  if (hidden) {
    return (
      <section aria-label="Música (oculto)" className="mx-auto mb-3 flex w-full max-w-xl items-center gap-2 rounded-lg bg-panel px-3 py-1 text-sm">
        <Music2 className="size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 truncate text-muted-foreground" title={track.title}>
          Tocando: <span className="text-accent-foreground">{track.title}</span>
        </p>
        <PlayerButton label="Mostrar o player" onClick={() => changeHidden(false)} className="p-1 [&_svg]:size-4">
          <ChevronUp />
        </PlayerButton>
      </section>
    )
  }

  return (
    <section aria-label="Tocando agora" className="mx-auto mb-3 flex w-full max-w-xl flex-col gap-2 rounded-lg bg-panel p-3">
      <div className="flex items-center gap-3">
        <TrackCover track={track} className="size-16" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tocando agora</p>
          <p className="truncate font-semibold text-accent-foreground" title={track.title}>
            {track.title}
          </p>
          <p className="truncate text-sm text-muted-foreground">{track.artists.join(', ')}</p>
          <p className="truncate text-xs text-muted-foreground">
            Pedido por {track.requestedBy.name} · {trackDuration(track.durationMs)}
            {state.queue.length > 0 && ` · ${state.queue.length} na fila`}
          </p>
        </div>
        <PlayerButton label="Ocultar o player" onClick={() => changeHidden(true)} className="self-start p-1 [&_svg]:size-4">
          <ChevronDown />
        </PlayerButton>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <PlayerButton label="Ver a fila" onClick={() => openMusicQueue(channelId)}>
          <ListMusic />
        </PlayerButton>
        {inRoom && (
          <>
            {state.paused ? (
              <PlayerButton label="Retomar a música" onClick={() => resumeMusic(channelId).catch(reportError)}>
                <Play />
              </PlayerButton>
            ) : (
              <PlayerButton label="Pausar a música" onClick={() => pauseMusic(channelId).catch(reportError)}>
                <Pause />
              </PlayerButton>
            )}
            <PlayerButton label="Pular música" onClick={() => skipMusic(channelId).catch(reportError)}>
              <SkipForward />
            </PlayerButton>
            <PlayerButton label="Parar a música" onClick={() => stopMusic(channelId).catch(reportError)} className="hover:text-destructive">
              <Square />
            </PlayerButton>
            <div className="ml-auto px-1">
              <MusicVolumeSlider className="w-20" />
            </div>
          </>
        )}
      </div>
    </section>
  )
}

export function MusicBotMember({ channelId }: { channelId: string }) {
  const playing = useApp((s) => !!s.musicRooms[channelId]?.nowPlaying)
  const muted = useApp((s) => !!s.userMuted[MUSIC_BOT_VOLUME_ID])
  if (!playing) return null
  return (
    <MusicBotContextMenu>
      <div className="flex h-7 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground" data-testid="music-bot">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Music2 className="size-3.5" />
        </span>
        <span className="flex-1 truncate">{MUSIC_BOT_NAME}</span>
        {muted && <VolumeX aria-label="Silenciado por você" className="size-3.5 shrink-0 text-destructive" />}
        <BotBadge />
      </div>
    </MusicBotContextMenu>
  )
}
