// Atualização automática (A13): faixa no topo quando a versão nova já foi baixada.
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dismissUpdate, installUpdate } from '@/lib/client'
import { useApp } from '@/store'

export function UpdateBanner() {
  const update = useApp((s) => s.update)
  const dismissed = useApp((s) => s.updateDismissed)
  if (update.state !== 'ready' || dismissed === update.version) return null
  return (
    <div role="status" className="flex h-9 shrink-0 items-center justify-center gap-3 bg-primary px-4 text-sm text-primary-foreground">
      <Download className="size-4" />
      <span>A versão {update.version} do Concord está pronta.</span>
      <Button size="sm" variant="secondary" className="h-7" onClick={installUpdate}>
        Reiniciar para atualizar
      </Button>
      <button type="button" className="text-xs underline-offset-2 opacity-80 hover:underline" onClick={dismissUpdate}>
        Depois
      </button>
    </div>
  )
}
