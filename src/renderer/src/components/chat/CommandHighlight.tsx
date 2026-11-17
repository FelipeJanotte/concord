import type { ChatCommandArg } from '@/lib/commands'
import { cn } from '@/lib/utils'

export const COMPOSER_TEXT = 'py-1.5 text-[15px] leading-[22px] whitespace-pre-wrap break-words'

export function CommandHighlight({ command, rest, arg }: { command: string; rest: string; arg?: ChatCommandArg }) {
  const waitingArg = arg && !rest.trim()
  return (
    <div aria-hidden data-testid="command-highlight" className={cn(COMPOSER_TEXT, 'pointer-events-none absolute inset-0 overflow-hidden')}>
      <code className="-mx-0.5 rounded bg-secondary px-0.5 font-[inherit] text-secondary-foreground">{command}</code>
      {rest}
      {waitingArg && (
        <span className="text-muted-foreground">
          {rest ? '' : ' '}
          <span className="rounded border border-border px-1">{arg.name}</span>
          <span className="opacity-60"> {arg.hint}</span>
        </span>
      )}
    </div>
  )
}
