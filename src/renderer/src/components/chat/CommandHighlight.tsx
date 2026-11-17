import { cn } from '@/lib/utils'

export const COMPOSER_TEXT = 'py-1.5 text-[15px] leading-[22px] whitespace-pre-wrap break-words'

export function CommandHighlight({ command, rest, takesQuery }: { command: string; rest: string; takesQuery: boolean }) {
  const waitingQuery = takesQuery && !rest.trim()
  return (
    <div aria-hidden data-testid="command-highlight" className={cn(COMPOSER_TEXT, 'pointer-events-none absolute inset-0 overflow-hidden')}>
      <code className="-mx-0.5 rounded bg-secondary px-0.5 font-[inherit] text-secondary-foreground">{command}</code>
      {rest}
      {waitingQuery && (
        <span className="text-muted-foreground">
          {rest ? '' : ' '}
          <span className="rounded border border-border px-1">query</span>
          <span className="opacity-60"> link do Spotify/YouTube ou nome da música</span>
        </span>
      )}
    </div>
  )
}
