import { useState, type FormEvent } from 'react'
import { Button } from '@ui-sdk/react/button'
import { Field, FieldError, FieldLabel } from '@ui-sdk/react/field'
import { Input } from '@ui-sdk/react/input'
import { Loader2, Play, Search } from 'lucide-react'
import { MUSIC_QUERY_MAX } from '@shared/types'
import { playMusic } from '@/lib/client'

export function MusicRequestForm({ channelId }: { channelId: string | null }) {
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const request = query.trim()

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!channelId || !request || sending) return
    setSending(true)
    try {
      await playMusic(channelId, request)
      setQuery('')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível falar com o bot de música')
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
      <Field disabled={!channelId} invalid={error ? true : undefined} className="flex flex-col gap-2">
        <FieldLabel className="sr-only">Pedir uma música</FieldLabel>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-composer p-1.5 pl-4 shadow-sm transition-[border-color,box-shadow] focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/15 has-[[data-disabled]]:opacity-60 has-[[aria-invalid=true]]:border-destructive/70">
          <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            maxLength={MUSIC_QUERY_MAX}
            placeholder="Cole um link ou digite o nome"
            autoComplete="off"
            onValueChange={(value) => {
              setQuery(value)
              setError(null)
            }}
            className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground data-disabled:cursor-not-allowed"
          />
          <Button
            type="submit"
            disabled={!channelId || !request || sending}
            className="flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-[opacity,filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-composer focus-visible:outline-none data-disabled:opacity-50 data-disabled:hover:brightness-100"
          >
            {sending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Play aria-hidden className="size-4 fill-current" />}
            Tocar
          </Button>
        </div>
        {error && (
          <FieldError match className="px-1 text-sm text-destructive">
            {error}
          </FieldError>
        )}
      </Field>
    </form>
  )
}
