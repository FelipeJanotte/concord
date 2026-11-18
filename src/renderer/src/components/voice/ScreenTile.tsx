import { useEffect, useRef, type DragEvent } from 'react'
import { Columns2, EyeOff, Maximize2, Minimize2, Rows2, Users, UserX } from 'lucide-react'
import { attachScreen } from '@/lib/client'
import { useFullscreen } from '@/lib/fullscreen'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { ScreenViewers } from './ScreenViewers'

export type ScreenArrangement = 'side-by-side' | 'stacked'

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span className={cn('rounded bg-destructive px-1.5 py-px text-[10px] font-bold tracking-wide text-white uppercase', className)}>
      Ao vivo
    </span>
  )
}

function screenLabel(userId: string, selfId: string | undefined, name: string | undefined): string {
  return userId === selfId ? 'Sua tela' : `Tela de ${name ?? 'Alguém'}`
}

export function useScreenLabel(userId: string): string {
  const name = useApp((s) => s.users.find((u) => u.id === userId)?.name)
  const selfId = useApp((s) => s.self?.id)
  return screenLabel(userId, selfId, name)
}

const listFormat = new Intl.ListFormat('pt-BR', { type: 'conjunction' })

function useScreenLabels(userIds: string[]): string {
  const users = useApp((s) => s.users)
  const selfId = useApp((s) => s.self?.id)
  return listFormat.format(userIds.map((id) => screenLabel(id, selfId, users.find((u) => u.id === id)?.name)))
}

function ScreenVideo({ userId, label, onDoubleClick }: { userId: string; label: string; onDoubleClick?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    return attachScreen(userId, el)
  }, [userId])
  return <video ref={videoRef} autoPlay playsInline muted onDoubleClick={onDoubleClick} className="size-full min-h-0 object-contain" aria-label={label} />
}

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

function ScreenChip({ userId, selected, onToggle }: { userId: string; selected: boolean; onToggle: () => void }) {
  const label = useScreenLabel(userId)
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      title={selected ? `Tirar do destaque: ${label}` : `Pôr em destaque: ${label}`}
      className={cn(
        'shrink-0 truncate rounded-full px-3 py-1 text-xs font-medium transition-colors',
        selected ? 'bg-primary text-primary-foreground' : 'bg-white/10 text-white hover:bg-white/20'
      )}
    >
      {label}
    </button>
  )
}

interface PaneProps {
  userId: string
  movable: boolean
  onDragStart: () => void
  onDrop: () => void
  onDoubleClick: () => void
}

function ScreenPane({ userId, movable, onDragStart, onDrop, onDoubleClick }: PaneProps) {
  const label = useScreenLabel(userId)
  const allowDrop = (event: DragEvent): void => event.preventDefault()
  return (
    <div
      data-screen-pane={userId}
      draggable={movable}
      onDragStart={(event) => {
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragOver={allowDrop}
      onDrop={(event) => {
        event.preventDefault()
        onDrop()
      }}
      title={movable ? 'Arraste para mudar a ordem' : undefined}
      className={cn('relative flex min-h-0 min-w-0 flex-1 items-center justify-center', movable && 'cursor-grab')}
    >
      <ScreenVideo userId={userId} label={label} onDoubleClick={onDoubleClick} />
      {movable && (
        <span className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-black/60 px-2 py-0.5 text-sm text-white">
          {label}
        </span>
      )}
    </div>
  )
}

interface StageProps {
  featured: string[]
  screens: string[]
  onToggle: (userId: string) => void
  onMove: (dragged: string, target: string) => void
  arrangement: ScreenArrangement
  onToggleArrangement: () => void
  onStopWatching: () => void
  membersHidden?: boolean
  onToggleMembers?: () => void
}

const toolbarButton = 'rounded-md p-1.5 hover:bg-white/15 [&_svg]:size-4'

export function ScreenStage({ featured, screens, onToggle, onMove, arrangement, onToggleArrangement, onStopWatching, membersHidden = false, onToggleMembers }: StageProps) {
  const ref = useRef<HTMLDivElement>(null)
  const dragged = useRef<string | null>(null)
  const { active, toggle } = useFullscreen(ref)
  const label = useScreenLabels(featured)
  const selfId = useApp((s) => s.self?.id)
  const several = featured.length > 1
  const arrangementLabel = arrangement === 'side-by-side' ? 'Empilhar as telas' : 'Pôr as telas lado a lado'

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
              <ScreenChip key={id} userId={id} selected={featured.includes(id)} onToggle={() => onToggle(id)} />
            ))}
          </div>
        )}
        {selfId && featured.includes(selfId) && <ScreenViewers userId={selfId} className="ml-2 text-white/80" />}
        <div className="ml-auto flex shrink-0 gap-1">
          {several && (
            <button type="button" onClick={onToggleArrangement} title={arrangementLabel} aria-label={arrangementLabel} className={toolbarButton}>
              {arrangement === 'side-by-side' ? <Rows2 /> : <Columns2 />}
            </button>
          )}
          {!active && onToggleMembers && (
            <button
              type="button"
              onClick={onToggleMembers}
              aria-pressed={membersHidden}
              title={membersHidden ? 'Mostrar membros' : 'Esconder membros'}
              aria-label={membersHidden ? 'Mostrar membros' : 'Esconder membros'}
              className={toolbarButton}
            >
              {membersHidden ? <Users /> : <UserX />}
            </button>
          )}
          {!active && (
            <button type="button" onClick={onStopWatching} title="Parar de assistir" aria-label="Parar de assistir" className={toolbarButton}>
              <EyeOff />
            </button>
          )}
          <button
            type="button"
            onClick={toggle}
            title={active ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}
            aria-label={active ? 'Sair da tela cheia' : 'Tela cheia'}
            className={toolbarButton}
          >
            {active ? <Minimize2 /> : <Maximize2 />}
          </button>
        </div>
      </div>
      <div data-arrangement={arrangement} className={cn('flex min-h-0 flex-1 gap-1', arrangement === 'stacked' && 'flex-col')}>
        {featured.map((id) => (
          <ScreenPane
            key={id}
            userId={id}
            movable={several}
            onDragStart={() => {
              dragged.current = id
            }}
            onDrop={() => {
              if (dragged.current) onMove(dragged.current, id)
              dragged.current = null
            }}
            onDoubleClick={toggle}
          />
        ))}
      </div>
    </div>
  )
}
