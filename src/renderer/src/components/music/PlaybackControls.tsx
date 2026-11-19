import type { ComponentProps } from 'react'
import { Button } from '@ui-sdk/react/button'
import { Pause, Play, SkipForward, Square } from 'lucide-react'
import { notify, pauseMusic, resumeMusic, skipMusic, stopMusic } from '@/lib/client'
import { cn } from '@/lib/utils'

const reportError = (err: unknown): void => notify(err instanceof Error ? err.message : 'Não foi possível falar com o bot de música')

const run = (control: (channelId: string) => Promise<unknown>, channelId: string) => (): Promise<void> =>
  control(channelId).then(() => undefined, reportError)

function ControlButton({ className, label, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button
      aria-label={label}
      title={label}
      pendingAnnouncement=""
      className={cn(
        'flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-pending:opacity-60 [&_svg]:size-5',
        className
      )}
      {...props}
    />
  )
}

interface PlaybackControlsProps {
  channelId: string
  paused: boolean
}

export function PlaybackControls({ channelId, paused }: PlaybackControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <ControlButton
        label={paused ? 'Retomar' : 'Pausar'}
        onClick={run(paused ? resumeMusic : pauseMusic, channelId)}
        className="size-12 bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:scale-105 hover:bg-primary hover:text-primary-foreground active:scale-95 motion-reduce:hover:scale-100 [&_svg]:size-6 [&_svg]:fill-current"
      >
        {paused ? <Play aria-hidden className="translate-x-px" /> : <Pause aria-hidden />}
      </ControlButton>
      <ControlButton label="Pular" onClick={run(skipMusic, channelId)}>
        <SkipForward aria-hidden />
      </ControlButton>
      <ControlButton label="Parar e limpar a fila" onClick={run(stopMusic, channelId)} className="hover:text-destructive">
        <Square aria-hidden />
      </ControlButton>
    </div>
  )
}
