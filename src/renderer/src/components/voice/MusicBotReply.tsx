import { Loader2, Music2 } from 'lucide-react'
import { MUSIC_BOT_NAME, musicFailedText, musicSearchingText, musicShuffleText, musicTrackLabel, type Message, type MusicBotReply, type MusicTrackSummary } from '@shared/types'
import { cn } from '@/lib/utils'
import { BotBadge, TrackCover } from './MusicPlayer'

export const isMusicBotMessage = (message: Message): boolean => message.kind === 'tool' && message.tool?.tool === 'music'

export function MusicBotAvatar({ className }: { className?: string }) {
  return (
    <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground', className)}>
      <Music2 className="size-5" />
    </div>
  )
}

export function MusicBotName() {
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-medium text-accent-foreground">{MUSIC_BOT_NAME}</span>
      <BotBadge />
    </span>
  )
}

interface ReplyView {
  heading: string
  track: MusicTrackSummary | null
  note?: string
  searching?: boolean
  failed?: boolean
}

function replyView(reply: MusicBotReply): ReplyView {
  switch (reply.action) {
    case 'play':
      if (reply.added > 1) return { heading: `Adicionou ${reply.added} músicas à fila, começando por`, track: reply.first }
      return { heading: reply.startedNow ? 'Tocando agora' : 'Adicionou à fila', track: reply.first }
    case 'skip':
      return { heading: 'Pulou', track: reply.skipped, note: reply.next ? `Tocando agora: ${musicTrackLabel(reply.next)}` : undefined }
    case 'stop':
      return { heading: 'Parou a música e limpou a fila', track: null }
    case 'shuffle':
      return { heading: musicShuffleText(reply.count), track: null }
    case 'searching':
      return { heading: musicSearchingText(reply.query), track: null, searching: true }
    case 'failed':
      return { heading: musicFailedText(reply.error), track: null, failed: true }
  }
}

export function MusicReplyCard({ message, reply }: { message: Message; reply: MusicBotReply }) {
  const { heading, track, note, searching, failed } = replyView(reply)
  return (
    <section aria-label="Resposta do bot de música" className="mt-1 flex max-w-lg items-center gap-3 rounded-lg border border-border bg-panel p-2 text-foreground">
      {track && <TrackCover track={track} className="size-10" />}
      {searching && <Loader2 role="status" aria-label="Procurando" className="size-4 shrink-0 animate-spin text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className={cn('break-words text-xs font-semibold', failed ? 'text-destructive' : 'text-muted-foreground')}>{heading}</p>
        {track && (
          <>
            <p className="truncate text-sm font-semibold text-accent-foreground" title={track.title}>
              {track.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">{track.artists.join(', ')}</p>
          </>
        )}
        {note && <p className="truncate text-xs text-muted-foreground">{note}</p>}
        <p className="text-[11px] text-muted-foreground">Pedido por {message.author.name}</p>
      </div>
    </section>
  )
}
