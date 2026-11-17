import type { ChatCommand } from '@/lib/commands'
import { SuggestionList } from './SuggestionList'

export function CommandMenu({ items, active, onPick }: { items: ChatCommand[]; active: number; onPick: (item: ChatCommand) => void }) {
  return (
    <SuggestionList label="Comandos" items={items} active={active} keyOf={(item) => item.name} onPick={onPick}>
      {(item) => (
        <>
          <code className="font-mono font-semibold text-foreground">/{item.name}</code>
          {item.arg && <span className="rounded border border-border px-1 text-xs">{item.arg.name}</span>}
          <span className="min-w-0 truncate text-xs">{item.description}</span>
        </>
      )}
    </SuggestionList>
  )
}
