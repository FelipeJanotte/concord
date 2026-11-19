import { Avatar, AvatarFallback, AvatarImage } from '@ui-sdk/react/avatar'
import { Music2 } from 'lucide-react'
import type { MusicTrack } from '@shared/types'
import { cn } from '@/lib/utils'

interface CoverArtProps {
  track: Pick<MusicTrack, 'title' | 'coverUrl'>
  className: string
}

export function CoverArt({ track, className }: CoverArtProps) {
  return (
    <Avatar className={cn('relative flex shrink-0 overflow-hidden', className)}>
      {track.coverUrl && <AvatarImage src={track.coverUrl} alt={`Capa de ${track.title}`} className="size-full object-cover" />}
      <AvatarFallback className="flex size-full items-center justify-center bg-gradient-to-br from-primary/70 via-primary/30 to-secondary text-primary-foreground">
        <Music2 aria-hidden className="size-2/5" />
      </AvatarFallback>
    </Avatar>
  )
}
