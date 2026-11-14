import { useEffect, useState, type FormEvent } from 'react'
import { Hash, Loader2, Volume2 } from 'lucide-react'
import type { ChannelType } from '@shared/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createChannel, selectTextChannel } from '@/lib/client'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  defaultType: ChannelType
  onOpenChange: (open: boolean) => void
}

const options: { type: ChannelType; title: string; description: string; Icon: typeof Hash }[] = [
  { type: 'text', title: 'Texto', description: 'Envie mensagens, opiniões e piadas', Icon: Hash },
  { type: 'voice', title: 'Voz', description: 'Converse por voz com quem estiver na sala', Icon: Volume2 }
]

export function CreateChannelDialog({ open, defaultType, onOpenChange }: Props) {
  const [type, setType] = useState<ChannelType>(defaultType)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setType(defaultType)
    setName('')
    setError(null)
    setLoading(false)
  }, [open, defaultType])

  const displayName = type === 'text' ? name.toLowerCase().replace(/\s+/g, '-') : name

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const channel = await createChannel(name, type)
      onOpenChange(false)
      if (channel.type === 'text') selectTextChannel(channel.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar canal')
      setLoading(false)
    }
  }

  const Icon = type === 'text' ? Hash : Volume2

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>Criar canal</DialogTitle>
            <DialogDescription>Canais de texto guardam o histórico; canais de voz são salas para conversar.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Tipo de canal</span>
            <div className="grid gap-2" role="radiogroup">
              {options.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  role="radio"
                  aria-checked={type === opt.type}
                  onClick={() => setType(opt.type)}
                  className={cn(
                    'flex items-center gap-3 rounded-md bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/70',
                    type === opt.type && 'bg-accent'
                  )}
                >
                  <opt.Icon className="size-6 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium text-accent-foreground">{opt.title}</div>
                    <div className="text-sm text-muted-foreground">{opt.description}</div>
                  </div>
                  <span
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full border-2 border-muted-foreground',
                      type === opt.type && 'border-accent-foreground'
                    )}
                  >
                    {type === opt.type && <span className="size-2.5 rounded-full bg-accent-foreground" />}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-name" className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              Nome do canal
            </Label>
            <div className="relative">
              <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="channel-name"
                autoFocus
                maxLength={32}
                placeholder={type === 'text' ? 'novo-canal' : 'Nova sala'}
                className="pl-9"
                value={displayName}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="link" className="text-accent-foreground" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading && <Loader2 className="animate-spin" />}
              Criar canal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
