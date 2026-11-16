import type { ComponentType } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import type { WindowControlAction } from '@shared/window-controls'
import { runWindowControl, windowEnv } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

export function TitleBar() {
  const maximized = useApp((s) => s.windowMaximized)
  const bridge = windowEnv.bridge()
  if (!bridge) return null

  return (
    <header
      className={cn(
        'relative z-[60] flex h-8 shrink-0 items-center bg-rail select-none [-webkit-app-region:drag]',
        bridge.buttons ? 'pl-3' : 'pl-[76px]'
      )}
    >
      <span className="text-xs font-semibold tracking-wide text-muted-foreground">Concord</span>
      {bridge.buttons && (
        <div className="ml-auto flex h-full items-center gap-0.5 pr-1.5 [-webkit-app-region:no-drag]">
          <WindowButton action="minimize" label="Minimizar" icon={Minus} />
          <WindowButton action="maximize" label={maximized ? 'Restaurar' : 'Maximizar'} icon={maximized ? Copy : Square} />
          <WindowButton action="close" label="Fechar" icon={X} danger />
        </div>
      )}
    </header>
  )
}

function WindowButton({
  action,
  label,
  icon: Icon,
  danger = false
}: {
  action: WindowControlAction
  label: string
  icon: ComponentType<{ className?: string }>
  danger?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => runWindowControl(action)}
      className={cn(
        'flex h-6 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        danger ? 'hover:bg-destructive hover:text-white' : 'hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <Icon className={action === 'maximize' ? 'size-3.5' : 'size-4'} />
    </button>
  )
}
