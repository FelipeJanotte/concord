import { Download, Loader2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { installUpdate } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

export function UpdateRailSlot() {
  const update = useApp((s) => s.update)
  if (update.state !== 'downloading' && update.state !== 'ready') return null
  const ready = update.state === 'ready'
  const label = ready ? 'Atualizar o Concord' : `Baixando atualização (${update.percent}%)`
  const hint = ready ? `Versão ${update.version} pronta: reinicia e abre de novo` : `Versão ${update.version}`

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={ready ? installUpdate : undefined}
            aria-disabled={!ready}
            aria-label={label}
            className={cn(
              'relative flex size-12 items-center justify-center rounded-3xl transition-all duration-150',
              ready ? 'bg-success text-white hover:rounded-2xl hover:bg-success/90' : 'cursor-default bg-sidebar text-muted-foreground'
            )}
          >
            {ready ? <Download className="size-6" /> : <Loader2 className="size-6 animate-spin" />}
            {!ready && (
              <span className="absolute -right-1 -bottom-1 rounded-full border-4 border-rail bg-sidebar px-1 text-[10px] font-bold text-accent-foreground tabular-nums">
                {update.percent}%
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <div className="font-semibold">{label}</div>
          <div className="text-xs text-muted-foreground">{hint}</div>
        </TooltipContent>
      </Tooltip>
      <span aria-hidden className="mx-auto h-px w-8 bg-border" />
    </>
  )
}
