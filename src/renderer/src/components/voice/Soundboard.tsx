import { useId, useState, type ReactNode } from 'react'
import { Loader2, Trash2, Volume2 } from 'lucide-react'
import type { Sound } from '@shared/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { deleteSound, playSound, refreshSounds, setSoundboardVolume } from '@/lib/client'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { findDm } from '@/lib/dms'
import { SoundUploadForm } from './SoundUploadForm'

export function SoundboardPopover({ side = 'top', children }: { side?: 'top' | 'right'; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const titleId = useId()

  function change(next: boolean): void {
    setOpen(next)
    if (next) refreshSounds()
  }

  return (
    <Popover open={open} onOpenChange={change} modal={false}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side={side} sideOffset={8} aria-labelledby={titleId} className="flex max-h-[min(28rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto p-3">
        <SoundboardContent titleId={titleId} />
      </PopoverContent>
    </Popover>
  )
}

function SoundboardContent({ titleId }: { titleId: string }) {
  const sounds = useApp((s) => s.sounds)
  const loaded = useApp((s) => s.soundsLoaded)
  const inRoom = useApp((s) => !!s.myVoiceChannelId)
  const canSpeak = useApp((s) => s.voiceCanSpeak)
  const inCall = useApp((s) => !!s.myVoiceChannelId && !!findDm(s.dms, s.myVoiceChannelId))
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  async function run(fn: () => Promise<void>): Promise<void> {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível tocar o som')
    }
  }

  const blocked = !inRoom ? 'Entre numa sala de voz para tocar sons.' : !canSpeak ? 'Você não pode falar nesta sala, então não toca sons.' : null

  return (
    <>
      <div>
        <h2 id={titleId} className="text-sm font-semibold text-accent-foreground">
          Efeitos sonoros
        </h2>
        <p className="text-xs text-muted-foreground">
          Toca para {inCall ? 'a outra pessoa da chamada' : 'todos na sala'}. Até 5 segundos cada.
        </p>
      </div>

      <SoundboardVolume />

      {uploading ? (
        <SoundUploadForm onDone={() => setUploading(false)} />
      ) : (
        <>
          {blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}
          {!loaded ? (
            <div className="flex justify-center py-4 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-label="Carregando sons" />
            </div>
          ) : sounds.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">Nenhum som ainda. Envie o primeiro!</p>
          ) : (
            <ul aria-label="Sons" className="grid max-h-60 grid-cols-3 gap-1 overflow-y-auto">
              {sounds.map((sound) => (
                <SoundTile key={sound.id} sound={sound} disabled={!!blocked} onPlay={() => void run(() => playSound(sound.id))} onError={setError} />
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <button type="button" onClick={() => setUploading(true)} className="self-start text-xs font-medium text-primary hover:underline">
            Enviar um som
          </button>
        </>
      )}
    </>
  )
}

function SoundboardVolume() {
  const pct = useApp((s) => Math.round(s.soundboardVolume * 100))
  return (
    <div className="flex items-center gap-2">
      <Volume2 className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        aria-label="Volume dos efeitos sonoros"
        onChange={(e) => setSoundboardVolume(Number(e.target.value) / 100)}
        className="h-1 flex-1 accent-primary"
      />
      <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  )
}

function SoundTile({ sound, disabled, onPlay, onError }: { sound: Sound; disabled: boolean; onPlay: () => void; onError: (e: string) => void }) {
  const mine = useApp((s) => !!s.self && s.self.accountId === sound.uploaderId)
  const canManage = useCan('manageMessages')
  const playing = useApp((s) => Object.values(s.soundsPlaying).some((p) => p.soundId === sound.id))
  const [confirming, setConfirming] = useState(false)

  async function remove(): Promise<void> {
    try {
      await deleteSound(sound.id)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Não foi possível apagar o som')
      setConfirming(false)
    }
  }

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onPlay}
        disabled={disabled}
        aria-label={`Tocar ${sound.name}`}
        title={sound.name}
        className={cn(
          'flex h-8 w-full items-center gap-1.5 rounded-md bg-accent px-2 text-left text-xs font-medium text-accent-foreground transition-colors enabled:group-hover:bg-primary enabled:group-hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50',
          playing && 'ring-2 ring-success ring-inset'
        )}
      >
        <span className="shrink-0 text-base leading-none">{sound.emoji ?? <Volume2 className="size-3.5" />}</span>
        <span className="min-w-0 flex-1 truncate">{sound.name}</span>
      </button>
      {(mine || canManage) &&
        (confirming ? (
          <div className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-md bg-background/95 text-[11px]">
            <button type="button" className="font-semibold text-destructive" onClick={() => void remove()}>
              Apagar
            </button>
            <button type="button" className="text-muted-foreground" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Apagar ${sound.name}`}
            onClick={() => setConfirming(true)}
            className="absolute top-1/2 right-1 -translate-y-1/2 rounded bg-background/80 p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
          >
            <Trash2 className="size-3" />
          </button>
        ))}
    </li>
  )
}

export function SoundsPlayingBar() {
  const playing = useApp((s) => s.soundsPlaying)
  const sounds = useApp((s) => s.sounds)
  const items = Object.entries(playing)
  if (items.length === 0) return null
  return (
    <div role="status" aria-live="polite" className="flex flex-wrap justify-center gap-2 pb-2 text-xs text-muted-foreground">
      {items.map(([accountId, p]) => {
        const sound = sounds.find((x) => x.id === p.soundId)
        return (
          <span key={accountId} className="rounded-full bg-panel px-3 py-1">
            {sound?.emoji ?? '🔊'} {p.by} tocou {sound?.name ?? 'um som'}
          </span>
        )
      })}
    </div>
  )
}
