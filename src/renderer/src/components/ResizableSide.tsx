import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { clampWidth, loadSideWidth, saveSideWidth, type SidePanel } from '@/lib/side-width'
import { cn } from '@/lib/utils'

type Props = {
  panel: SidePanel
  edge: 'left' | 'right'
  label: string
  className?: string
  children: ReactNode
}

type Drag = { startX: number; startWidth: number }

export function ResizableSide({ panel, edge, label, className, children }: Props) {
  const [width, setWidth] = useState(() => loadSideWidth(panel))
  const drag = useRef<Drag | null>(null)
  const growsRight = edge === 'right' ? 1 : -1

  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startWidth: width }
  }

  const widthAt = (clientX: number, { startX, startWidth }: Drag) => clampWidth(startWidth + (clientX - startX) * growsRight, panel)

  const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) setWidth(widthAt(e.clientX, drag.current))
  }

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const finalWidth = widthAt(e.clientX, drag.current)
    drag.current = null
    setWidth(finalWidth)
    saveSideWidth(panel, finalWidth)
  }

  const resetWidth = () => {
    setWidth(panel.initial)
    saveSideWidth(panel, panel.initial)
  }

  return (
    <div className={cn('relative flex shrink-0', className)} style={{ width }}>
      {children}
      <div
        role="separator"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={panel.min}
        aria-valuemax={panel.max}
        title="Arraste para redimensionar (duplo clique volta ao padrão)"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onDoubleClick={resetWidth}
        className={cn(
          'absolute inset-y-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40 active:bg-primary/60',
          edge === 'right' ? '-right-0.75' : '-left-0.75'
        )}
      />
    </div>
  )
}
