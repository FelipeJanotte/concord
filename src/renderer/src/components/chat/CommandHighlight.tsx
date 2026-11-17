import type { Ref } from 'react'
import type { ChatCommandArg } from '@/lib/commands'
import { cn } from '@/lib/utils'

export const COMPOSER_TEXT = 'py-1.5 text-[15px] leading-[22px] whitespace-pre-wrap break-words'

export function CommandHighlight({ command, rest }: { command: string; rest: string }) {
  return (
    <div aria-hidden data-testid="command-highlight" className={cn(COMPOSER_TEXT, 'pointer-events-none absolute inset-0 overflow-hidden')}>
      <code className="-mx-0.5 rounded bg-secondary px-0.5 font-[inherit] text-secondary-foreground">{command}</code>
      {rest}
    </div>
  )
}

export function CommandBlock({ command, arg, ref }: { command: string; arg: ChatCommandArg; ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      data-testid="command-block"
      className="pointer-events-none absolute top-0 left-0 flex items-center gap-1.5 py-1.5 text-[15px] leading-[22px]"
    >
      <code className="rounded bg-secondary px-1 font-[inherit] text-secondary-foreground">{command}</code>
      <span title={arg.hint} className="rounded border border-border bg-secondary px-1.5 text-sm text-muted-foreground">
        {arg.name}
      </span>
    </div>
  )
}
