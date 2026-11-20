import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@ui-sdk/react/button'
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogTitle } from '@ui-sdk/react/dialog'
import { Field, FieldDescription, FieldLabel } from '@ui-sdk/react/field'
import { Input } from '@ui-sdk/react/input'
import { Radio, RadioGroup, RadioIndicator } from '@ui-sdk/react/radio'
import { Loader2, X } from 'lucide-react'
import { CUSTOM_STATUS_TEXT_MAX, customStatusExpiry, type CustomStatusDuration } from '@shared/profile'
import { setCustomStatus } from '@/lib/client'
import { useActiveCustomStatus } from '@/lib/custom-status'
import { useApp } from '@/store'
import { EmojiPicker } from './voice/EmojiPicker'

const DURATIONS: { value: CustomStatusDuration; label: string }[] = [
  { value: '30m', label: '30 minutos' },
  { value: '1h', label: '1 hora' },
  { value: '4h', label: '4 horas' },
  { value: 'today', label: 'Hoje' },
  { value: 'never', label: 'Nunca' }
]

const LABEL = 'text-xs font-bold tracking-wide text-muted-foreground uppercase'

export function CustomStatusDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const current = useActiveCustomStatus(useApp((s) => s.account?.customStatus))
  const [emoji, setEmoji] = useState('')
  const [text, setText] = useState('')
  const [duration, setDuration] = useState<CustomStatusDuration>('today')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setEmoji(current?.emoji ?? '')
    setText(current?.text ?? '')
    setDuration(current && !current.expiresAt ? 'never' : 'today')
    setError(null)
  }, [open, current])

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await setCustomStatus({
        ...(emoji ? { emoji } : {}),
        ...(text.trim() ? { text: text.trim() } : {}),
        expiresAt: customStatusExpiry(duration, new Date())
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o status')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogBackdrop className="bg-background/70 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogContent
        data-glass="surface"
        className="w-[min(440px,92vw)] rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
      >
        <form onSubmit={(event) => void save(event)} className="grid gap-4">
          <DialogTitle className="text-base font-bold text-accent-foreground">Definir status personalizado</DialogTitle>

          <div className="grid gap-2">
            <span className={LABEL}>Emoji</span>
            <EmojiPicker value={emoji} onChange={setEmoji} />
          </div>

          <Field className="grid gap-2">
            <FieldLabel className={LABEL}>Status</FieldLabel>
            <div className="flex items-center gap-2 rounded-md border border-input bg-card px-3 focus-within:ring-2 focus-within:ring-ring">
              {emoji && <span aria-hidden className="text-lg">{emoji}</span>}
              <Input
                value={text}
                maxLength={CUSTOM_STATUS_TEXT_MAX}
                placeholder="O que você está fazendo?"
                autoComplete="off"
                onValueChange={setText}
                className="h-9 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            <FieldDescription className="text-right text-xs text-muted-foreground">{`${text.length}/${CUSTOM_STATUS_TEXT_MAX}`}</FieldDescription>
          </Field>

          <Field className="grid gap-2">
            <FieldLabel className={LABEL}>Limpar depois de</FieldLabel>
            <RadioGroup
              value={duration}
              onValueChange={(next) => next && setDuration(next as CustomStatusDuration)}
              className="flex flex-wrap gap-2"
            >
              {DURATIONS.map((d) => (
                <label
                  key={d.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm text-accent-foreground has-[[data-checked]]:bg-primary has-[[data-checked]]:text-primary-foreground"
                >
                  <Radio value={d.value} className="flex size-4 items-center justify-center rounded-full border border-current">
                    <RadioIndicator className="size-2 rounded-full bg-current" />
                  </Radio>
                  {d.label}
                </label>
              ))}
            </RadioGroup>
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <DialogClose className="h-9 rounded-lg px-4 text-sm text-foreground hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              Cancelar
            </DialogClose>
            <Button
              type="submit"
              disabled={saving || (!emoji && !text.trim())}
              className="flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-disabled:opacity-50"
            >
              {saving && <Loader2 aria-hidden className="size-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </form>
        <DialogClose aria-label="Fechar" className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground hover:bg-foreground/10 hover:text-accent-foreground">
          <X aria-hidden className="size-4" />
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
