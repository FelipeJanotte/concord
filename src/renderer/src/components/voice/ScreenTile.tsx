// Tela compartilhada de uma pessoa (vídeo vindo do LiveKit).
import { useEffect, useRef } from 'react'
import { Maximize2 } from 'lucide-react'
import { attachScreen } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span className={cn('rounded bg-destructive px-1.5 py-px text-[10px] font-bold tracking-wide text-white uppercase', className)}>
      Ao vivo
    </span>
  )
}

interface Props {
  userId: string
  /** em destaque (grande) ou miniatura na faixa de baixo */
  featured?: boolean
  onSelect?: () => void
}

export function ScreenTile({ userId, featured = false, onSelect }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const user = useApp((s) => s.users.find((u) => u.id === userId))
  const isSelf = useApp((s) => s.self?.id === userId)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    return attachScreen(userId, el)
  }, [userId])

  const name = user?.name ?? 'Alguém'

  return (
    <div
      className={cn(
        'group relative flex items-center justify-center overflow-hidden rounded-lg bg-black',
        featured ? 'min-h-0 flex-1' : 'aspect-video cursor-pointer ring-2 ring-transparent hover:ring-primary'
      )}
      onClick={featured ? undefined : onSelect}
      role={featured ? undefined : 'button'}
      aria-label={featured ? undefined : `Ver a tela de ${name}`}
    >
      {/* O áudio da tela (se houver) toca por outro elemento; o vídeo fica sempre mudo. */}
      <video ref={videoRef} autoPlay playsInline muted className="size-full object-contain" aria-label={`Tela de ${name}`} />
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-sm text-white">
        <LiveBadge />
        {isSelf ? 'Sua tela' : `Tela de ${name}`}
      </div>
      {featured && (
        <button
          onClick={() => void videoRef.current?.requestFullscreen()}
          aria-label="Tela cheia"
          className="absolute top-2 right-2 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [&_svg]:size-4"
        >
          <Maximize2 />
        </button>
      )}
    </div>
  )
}
