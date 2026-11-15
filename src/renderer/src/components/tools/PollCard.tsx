// Cartão da enquete no chat (B10): votar (único ou vários), ver as contagens e encerrar.
// Votos são anônimos: só as contagens; o que eu marquei vem de `myPollVotes`.
import { useState } from 'react'
import { BarChart3, Check, Lock } from 'lucide-react'
import type { Message, PollResult } from '@shared/types'
import { Button } from '@/components/ui/button'
import { closePoll, votePoll } from '@/lib/client'
import { findDm } from '@/lib/dms'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { CardFrame } from './CardFrame'

export function PollCard({ message, result }: { message: Message; result: PollResult }) {
  const mine = useApp((s) => s.myPollVotes[message.id])
  const isAuthor = useApp((s) => s.self?.accountId === message.author.accountId)
  const inDm = useApp((s) => !!findDm(s.dms, message.channelId))
  const canManage = useCan('manageMessages')
  const canVote = useCan('send', message.channelId)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const chosen = mine ?? []
  const total = result.counts.reduce((a, b) => a + b, 0)

  async function run(fn: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível votar')
    } finally {
      setBusy(false)
    }
  }

  function toggle(index: number): void {
    let next: number[]
    if (result.multiple) next = chosen.includes(index) ? chosen.filter((i) => i !== index) : [...chosen, index].sort((a, b) => a - b)
    else next = chosen.includes(index) ? [] : [index]
    void run(() => votePoll(message.channelId, message.id, next))
  }

  const people = `${result.voters} ${result.voters === 1 ? 'pessoa votou' : 'pessoas votaram'}`
  return (
    <CardFrame icon={<BarChart3 className="size-4" />} title={result.closed ? 'Enquete encerrada' : 'Enquete'} label="Enquete">
      <p className="mb-2 font-semibold text-accent-foreground">{result.question}</p>
      <ul className="flex flex-col gap-1.5">
        {result.options.map((option, i) => {
          const count = result.counts[i] ?? 0
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          const marked = chosen.includes(i)
          return (
            <li key={i}>
              <button
                type="button"
                disabled={result.closed || busy || !canVote}
                onClick={() => toggle(i)}
                aria-pressed={marked}
                aria-label={`${option}: ${count} ${count === 1 ? 'voto' : 'votos'}`}
                className={cn(
                  'relative flex w-full items-center gap-2 overflow-hidden rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  marked ? 'border-primary' : 'border-border',
                  !result.closed && canVote && 'hover:bg-accent',
                  'disabled:cursor-default'
                )}
              >
                <span className={cn('absolute inset-y-0 left-0', marked ? 'bg-primary/25' : 'bg-accent')} style={{ width: `${pct}%` }} />
                <span className="relative flex size-4 shrink-0 items-center justify-center">
                  {marked && <Check className="size-4 text-primary" />}
                </span>
                <span className="relative flex-1 break-words">{option}</span>
                <span className="relative text-xs text-muted-foreground">
                  {count} · {pct}%
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          {people}
          {result.multiple ? ' · várias opções' : ''}
        </span>
        {!result.closed && (isAuthor || (canManage && !inDm)) && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7"
            disabled={busy}
            onClick={() => void run(() => closePoll(message.channelId, message.id))}
          >
            <Lock className="size-3.5" />
            Encerrar
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </CardFrame>
  )
}
