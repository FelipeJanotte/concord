// Botão "Iniciar chamada" no cabeçalho da conversa privada (B8). Some enquanto há chamada nela.
import { Phone } from 'lucide-react'
import type { DmEntry } from '@shared/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { notify, startCall } from '@/lib/client'
import { useApp } from '@/store'

export function CallButton({ dm }: { dm: DmEntry }) {
  const busy = useApp((s) => !!s.calls[dm.channel.id])
  if (busy) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label="Iniciar chamada"
          onClick={() =>
            startCall(dm.channel.id).catch((err: unknown) => notify(err instanceof Error ? err.message : 'Não foi possível ligar'))
          }
          className="ml-auto text-muted-foreground hover:text-accent-foreground"
        >
          <Phone className="size-5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Iniciar chamada</TooltipContent>
    </Tooltip>
  )
}
