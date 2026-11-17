import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SuggestionList<T>({
  label,
  items,
  active,
  keyOf,
  onPick,
  children
}: {
  label: string
  items: T[]
  active: number
  keyOf: (item: T) => string
  onPick: (item: T) => void
  children: (item: T) => ReactNode
}) {
  if (items.length === 0) return null
  return (
    <ul role="listbox" aria-label={label} className="mb-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-panel p-1 shadow-lg">
      {items.map((item, i) => (
        <li
          key={keyOf(item)}
          role="option"
          aria-selected={i === active}
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(item)
          }}
          className={cn('flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm', i === active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground')}
        >
          {children(item)}
        </li>
      ))}
    </ul>
  )
}
