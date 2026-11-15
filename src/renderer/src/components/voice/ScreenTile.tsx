// Tela compartilhada (vídeo vindo do LiveKit): `ScreenTile` é a miniatura/quadro clicável (faixa de
// baixo ou grade) e `ScreenStage` é a tela em destaque, com a barra "Assistindo", o seletor das telas
// ao vivo, "Tela cheia" e "Ver grade". A tela cheia vale para o quadro inteiro (a barra continua à vista).
import { useEffect, useRef } from 'react'
import { LayoutGrid, Maximize2, Minimize2 } from 'lucide-react'
import { attachScreen } from '@/lib/client'
import { useFullscreen } from '@/lib/fullscreen'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span className={cn('rounded bg-destructive px-1.5 py-px text-[10px] font-bold tracking-wide text-white uppercase', className)}>
      Ao vivo
    </span>
  )
}

/** "Sua tela" ou "Tela de Fulano". */
function useScreenLabel(userId: string): string {
  const name = useApp((s) => s.users.find((u) => u.id === userId)?.name ?? 'Alguém')
  const isSelf = useApp((s) => s.self?.id === userId)
  return isSelf ? 'Sua tela' : `Tela de ${name}`
}

/** O <video> mudo de uma tela (o áudio da tela, se houver, toca por outro elemento). */
function ScreenVideo({ userId, label, onDoubleClick }: { userId: string; label: string; onDoubleClick?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    return attachScreen(userId, el)
  }, [userId])
  return <video ref={videoRef} autoPlay playsInline muted onDoubleClick={onDoubleClick} className="size-full min-h-0 object-contain" aria-label={label} />
}

/** Miniatura (faixa de baixo) ou quadro da grade: clicar assiste essa tela em destaque. */
export function ScreenTile({ userId, onSelect }: { userId: string; onSelect: () => void }) {
  const label = useScreenLabel(userId)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Assistir: ${label}`}
      title={`Assistir: ${label}`}
      className="group relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-black ring-2 ring-transparent hover:ring-primary focus-visible:ring-primary"
    >
      <ScreenVideo userId={userId} label={label} />
      <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-sm text-white">
        <LiveBadge />
        <span className="truncate">{label}</span>
      </span>
      <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
        Assistir
      </span>
    </button>
  )
}

/** Botão de uma tela no seletor da barra (marca a que está em destaque). */
function ScreenChip({ userId, selected, onSelect }: { userId: string; selected: boolean; onSelect: () => void }) {
  const label = useScreenLabel(userId)
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'shrink-0 truncate rounded-full px-3 py-1 text-xs font-medium transition-colors',
        selected ? 'bg-primary text-primary-foreground' : 'bg-white/10 text-white hover:bg-white/20'
      )}
    >
      {label}
    </button>
  )
}

interface StageProps {
  /** tela em destaque */
  userId: string
  /** todas as telas ao vivo (o seletor aparece com mais de uma) */
  screens: string[]
  onSelect: (userId: string) => void
  /** sair do destaque e ver a grade */
  onShowGrid: () => void
}

/** A tela em destaque, com a barra de cima (sempre à vista, também em tela cheia). */
export function ScreenStage({ userId, screens, onSelect, onShowGrid }: StageProps) {
  const ref = useRef<HTMLDivElement>(null)
  const { active, toggle } = useFullscreen(ref)
  const label = useScreenLabel(userId)

  return (
    <div ref={ref} data-fullscreen={active || undefined} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-black">
      <div className="flex shrink-0 items-center gap-2 bg-black/80 px-3 py-2 text-white">
        <LiveBadge />
        <span className="truncate text-sm font-semibold" aria-live="polite">
          Assistindo: {label}
        </span>
        {screens.length > 1 && (
          <div role="group" aria-label="Telas ao vivo" className="ml-2 flex min-w-0 gap-1.5 overflow-x-auto">
            {screens.map((id) => (
              <ScreenChip key={id} userId={id} selected={id === userId} onSelect={() => onSelect(id)} />
            ))}
          </div>
        )}
        <div className="ml-auto flex shrink-0 gap-1">
          {!active && (
            <button type="button" onClick={onShowGrid} title="Ver grade" aria-label="Ver grade" className="rounded-md p-1.5 hover:bg-white/15 [&_svg]:size-4">
              <LayoutGrid />
            </button>
          )}
          <button
            type="button"
            onClick={toggle}
            title={active ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}
            aria-label={active ? 'Sair da tela cheia' : 'Tela cheia'}
            className="rounded-md p-1.5 hover:bg-white/15 [&_svg]:size-4"
          >
            {active ? <Minimize2 /> : <Maximize2 />}
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <ScreenVideo key={userId} userId={userId} label={label} onDoubleClick={toggle} />
      </div>
    </div>
  )
}
