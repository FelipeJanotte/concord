// Reações em mensagens (A16): chips com emoji e contagem embaixo da mensagem (clicar liga/tira a
// minha) e o seletor de emoji (o mesmo do soundboard) aberto pelo botão da barra ou pelo "+".
import { useState, type KeyboardEvent } from 'react'
import { SmilePlus } from 'lucide-react'
import type { Message, Reaction } from '@shared/types'
import { EmojiPicker } from '@/components/voice/EmojiPicker'
import { hasReacted, openReactionPicker, toggleReaction } from '@/lib/client'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

/** "Ana, Bia e mais 2" para o título do chip (quem está online aparece pelo nome). */
export function reactorsLabel(reaction: Reaction, names: Map<string, string>, me: string | undefined): string {
  const known = reaction.accountIds.map((id) => (id === me ? 'você' : names.get(id))).filter((n): n is string => !!n)
  const shown = known.slice(0, 3)
  const rest = reaction.accountIds.length - shown.length
  if (shown.length === 0) return `${rest} ${rest === 1 ? 'pessoa' : 'pessoas'}`
  return rest > 0 ? `${shown.join(', ')} e mais ${rest}` : shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} e ${shown.at(-1)}`
}

export function Reactions({ message }: { message: Message }) {
  const me = useApp((s) => s.self?.accountId)
  const users = useApp((s) => s.users)
  const pickerOpen = useApp((s) => s.reactionPickerFor === message.id)
  const canReact = useCan('send', message.channelId)
  const [error, setError] = useState<string | null>(null)
  const reactions = message.reactions ?? []
  if (reactions.length === 0 && !pickerOpen) return null

  const names = new Map(users.map((u) => [u.accountId, u.name]))

  async function toggle(emoji: string): Promise<void> {
    setError(null)
    openReactionPicker(null)
    try {
      await toggleReaction(message, emoji)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reagir')
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Escape') openReactionPicker(null)
  }

  return (
    <div className="mt-1 flex flex-col gap-1" onKeyDown={onKeyDown}>
      {reactions.length > 0 && (
        <ul aria-label="Reações" className="flex flex-wrap gap-1">
          {reactions.map((r) => {
            const mine = hasReacted(message, r.emoji, me)
            const who = reactorsLabel(r, names, me)
            return (
              <li key={r.emoji}>
                <button
                  type="button"
                  disabled={!canReact}
                  onClick={() => void toggle(r.emoji)}
                  aria-pressed={mine}
                  aria-label={`${r.emoji} ${r.accountIds.length}: ${who}`}
                  title={`${who} reagiu com ${r.emoji}`}
                  className={cn(
                    'flex h-6 items-center gap-1 rounded-md border px-1.5 text-sm transition-colors disabled:cursor-default',
                    mine ? 'border-primary bg-primary/20 text-accent-foreground' : 'border-transparent bg-panel text-muted-foreground hover:border-border'
                  )}
                >
                  <span>{r.emoji}</span>
                  <span className="text-xs font-semibold tabular-nums">{r.accountIds.length}</span>
                </button>
              </li>
            )
          })}
          {canReact && (
            <li>
              <button
                type="button"
                aria-label="Adicionar outra reação"
                onClick={() => openReactionPicker(pickerOpen ? null : message.id)}
                className="flex h-6 items-center rounded-md bg-panel px-1.5 text-muted-foreground hover:text-accent-foreground"
              >
                <SmilePlus className="size-4" />
              </button>
            </li>
          )}
        </ul>
      )}
      {pickerOpen && canReact && (
        <div className="max-w-sm">
          <EmojiPicker value="" onChange={(emoji) => emoji && void toggle(emoji)} />
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
