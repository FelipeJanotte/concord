import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Button } from '@ui-sdk/react/button'
import { ArrowLeftRight, Maximize2, X } from 'lucide-react'
import { backToRoom, closeScreenPip, openScreenPip } from '@/lib/client'
import { clampPip, defaultPip, loadPip, movePip, pipHeight, resizePip, savePip, type PipRect } from '@/lib/screen-pip'
import { useApp } from '@/store'
import { LiveBadge, ScreenVideo, useScreenLabel } from './ScreenTile'

const ICON_BUTTON =
  'flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4'

type Gesture = { kind: 'move' | 'resize'; startX: number; startY: number; from: PipRect }

const viewport = () => ({ width: window.innerWidth, height: window.innerHeight })

export function ScreenPip() {
  const screenId = useApp((s) => s.pipScreenId)
  if (!screenId) return null
  return <PipWindow screenId={screenId} />
}

function PipWindow({ screenId }: { screenId: string }) {
  const label = useScreenLabel(screenId)
  const screens = useApp((s) => s.screens)
  const [rect, setRect] = useState<PipRect>(() => clampPip(loadPip() ?? defaultPip(viewport()), viewport()))
  const gesture = useRef<Gesture | null>(null)

  useEffect(() => {
    const onResize = (): void => setRect((r) => clampPip(r, viewport()))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const begin = (kind: Gesture['kind']) => (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (kind === 'move' && (e.target as HTMLElement).closest('button'))) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    gesture.current = { kind, startX: e.clientX, startY: e.clientY, from: rect }
  }

  const track = (e: PointerEvent<HTMLElement>): void => {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.startX
    setRect(g.kind === 'move' ? movePip(g.from, dx, e.clientY - g.startY, viewport()) : resizePip(g.from, dx, viewport()))
  }

  const end = (): void => {
    if (!gesture.current) return
    gesture.current = null
    setRect((r) => {
      savePip(r)
      return r
    })
  }

  const next = screens[(screens.indexOf(screenId) + 1) % screens.length]

  return (
    <section
      role="region"
      aria-label={`Miniatura: ${label}`}
      data-glass="surface"
      style={{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${pipHeight(rect.width)}px` }}
      className="fixed z-40 flex flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-2xl"
    >
      <header
        data-testid="pip-header"
        onPointerDown={begin('move')}
        onPointerMove={track}
        onPointerUp={end}
        onPointerCancel={end}
        className="flex h-9 shrink-0 cursor-grab touch-none items-center gap-1.5 px-2 select-none active:cursor-grabbing"
      >
        <LiveBadge />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{label}</span>
        {screens.length > 1 && next && (
          <Button aria-label="Trocar de tela" title="Trocar de tela" className={ICON_BUTTON} onClick={() => openScreenPip(next)}>
            <ArrowLeftRight aria-hidden />
          </Button>
        )}
        <Button aria-label="Voltar para a sala" title="Voltar para a sala" className={ICON_BUTTON} onClick={backToRoom}>
          <Maximize2 aria-hidden />
        </Button>
        <Button aria-label="Fechar miniatura" title="Fechar miniatura" className={ICON_BUTTON} onClick={closeScreenPip}>
          <X aria-hidden />
        </Button>
      </header>
      <div className="relative min-h-0 flex-1 bg-background">
        <ScreenVideo userId={screenId} label={label} onDoubleClick={backToRoom} />
        <div
          role="separator"
          aria-label="Redimensionar a miniatura"
          onPointerDown={begin('resize')}
          onPointerMove={track}
          onPointerUp={end}
          onPointerCancel={end}
          className="absolute right-0 bottom-0 size-4 cursor-nwse-resize touch-none"
        />
      </div>
    </section>
  )
}
