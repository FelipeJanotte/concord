// Autocompletar das menções no campo (B19): aparece ao digitar "@", acima do campo. As teclas
// (setas, Enter/Tab, Esc) são tratadas pelo Composer; aqui só desenha e aceita o clique.
import { AtSign, Users } from 'lucide-react'
import { MENTION_EVERYONE } from '@shared/types'
import type { MentionCandidate } from '@/lib/mentions'
import { cn } from '@/lib/utils'

export function MentionMenu({
  items,
  active,
  onPick
}: {
  items: MentionCandidate[]
  active: number
  onPick: (item: MentionCandidate) => void
}) {
  if (items.length === 0) return null
  return (
    <ul role="listbox" aria-label="Mencionar" className="mb-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-panel p-1 shadow-lg">
      {items.map((item, i) => (
        <li
          key={item.id}
          role="option"
          aria-selected={i === active}
          // mousedown para não tirar o foco do campo antes de escolher
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(item)
          }}
          className={cn('flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm', i === active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground')}
        >
          {item.id === MENTION_EVERYONE ? <Users className="size-4" /> : <AtSign className="size-4" />}
          <span className="font-medium text-foreground">{item.label.slice(1)}</span>
          {item.id === MENTION_EVERYONE && <span className="text-xs">avisa todo mundo que vê o canal</span>}
        </li>
      ))}
    </ul>
  )
}
