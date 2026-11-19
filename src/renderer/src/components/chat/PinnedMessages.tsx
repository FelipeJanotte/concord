import { useEffect, useState } from 'react'
import { Loader2, Pin, X } from 'lucide-react'
import type { Message } from '@shared/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { jumpToMessage, loadPins, notify, pinMessage } from '@/lib/client'
import { useCanPin } from '@/lib/permissions'
import { messageSnippet } from '@/lib/search'
import { formatTimestamp } from '@/lib/utils'
import { useApp } from '@/store'

export function PinnedMessages({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false)
  const pins = useApp((s) => s.pins[channelId])
  const canPin = useCanPin(channelId)

  useEffect(() => {
    if (open && !pins) loadPins(channelId).catch(() => notify('Não foi possível carregar as mensagens fixadas'))
  }, [open, pins, channelId])

  function go(message: Message): void {
    setOpen(false)
    void jumpToMessage(channelId, message.id)
  }

  function unpin(message: Message): void {
    pinMessage(message.id, false).catch((err: unknown) => notify(err instanceof Error ? err.message : 'Não foi possível desafixar a mensagem'))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Mensagens fixadas" title="Mensagens fixadas" className="rounded p-1 text-muted-foreground hover:text-accent-foreground">
          <Pin className="size-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Mensagens fixadas" className="flex max-h-[70vh] w-96 flex-col p-0">
        <h2 className="border-b border-border px-4 py-3 font-semibold text-accent-foreground">Mensagens fixadas</h2>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {!pins ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-label="Carregando" />
            </div>
          ) : pins.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhuma mensagem fixada aqui ainda.</p>
          ) : (
            pins.map((m) => (
              <div key={m.id} className="group relative rounded-md hover:bg-accent/50">
                <button type="button" onClick={() => go(m)} className="block w-full px-3 py-2 text-left">
                  <span className="flex items-baseline gap-2">
                    <span className="font-medium" style={{ color: m.author.color }}>
                      {m.author.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatTimestamp(m.createdAt)}</span>
                  </span>
                  <span className="block text-sm break-words">{messageSnippet(m, '')[0].text}</span>
                </button>
                {canPin && (
                  <button
                    type="button"
                    aria-label="Desafixar"
                    title="Desafixar"
                    onClick={() => unpin(m)}
                    className="absolute top-2 right-2 hidden rounded p-1 text-muted-foreground group-hover:block hover:text-destructive focus:block"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
