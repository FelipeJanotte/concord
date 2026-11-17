import { Music2 } from 'lucide-react'
import { MUSIC_BOT_NAME, musicTrackLabel, type Message, type MusicBotReply, type MusicTrackSummary } from '@shared/types'
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
  }
}

export function MusicReplyCard({ message, reply }: { message: Message; reply: MusicBotReply }) {
  const { heading, track, note } = replyView(reply)
  return (
    <section aria-label="Resposta do bot de música" className="mt-1 flex max-w-lg items-center gap-3 rounded-lg border border-border bg-panel p-2 text-foreground">
      {track && <TrackCover track={track} className="size-10" />}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted-foreground">{heading}</p>
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
