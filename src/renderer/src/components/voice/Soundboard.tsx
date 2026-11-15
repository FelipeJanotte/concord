// Efeitos sonoros (soundboard, B17): janela com a grade de sons (clique toca para a sala; lixeira para
// quem pode apagar), o envio de um som novo e o indicador "fulano tocou X" na sala. Skill `concord-sounds`.
import { useState } from 'react'
import { Loader2, Trash2, Volume2 } from 'lucide-react'
import type { Sound } from '@shared/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { closeSoundboard, deleteSound, playSound } from '@/lib/client'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { SoundUploadForm } from './SoundUploadForm'

export function Soundboard() {
  const open = useApp((s) => s.soundboardOpen)
  const sounds = useApp((s) => s.sounds)
  const loaded = useApp((s) => s.soundsLoaded)
  const inRoom = useApp((s) => !!s.myVoiceChannelId)
  const canSpeak = useApp((s) => s.voiceCanSpeak)
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          closeSoundboard()
          setUploading(false)
          setError(null)
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Efeitos sonoros</DialogTitle>
          <DialogDescription>Clique num som para tocar para todos na sala. Cada som tem até 5 segundos.</DialogDescription>
        </DialogHeader>

        {uploading ? (
          <SoundUploadForm onDone={() => setUploading(false)} />
        ) : (
          <>
            {blocked && <p className="text-sm text-muted-foreground">{blocked}</p>}
            {!loaded ? (
              <div className="flex justify-center py-6 text-muted-foreground">
                <Loader2 className="size-6 animate-spin" aria-label="Carregando sons" />
              </div>
            ) : sounds.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhum som ainda. Envie o primeiro!</p>
            ) : (
              <ul aria-label="Sons" className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {sounds.map((sound) => (
                  <SoundTile key={sound.id} sound={sound} disabled={!!blocked} onPlay={() => void run(() => playSound(sound.id))} onError={setError} />
                ))}
              </ul>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <button type="button" onClick={() => setUploading(true)} className="self-start text-sm font-medium text-primary hover:underline">
              Enviar um som
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
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
        className={cn(
          'flex h-14 w-full items-center gap-2 rounded-md bg-accent px-3 text-left text-sm font-medium text-accent-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50',
          playing && 'ring-2 ring-success'
        )}
      >
        <span className="text-xl leading-none">{sound.emoji ?? <Volume2 className="size-5" />}</span>
        <span className="min-w-0 flex-1 truncate">{sound.name}</span>
      </button>
      {(mine || canManage) &&
        (confirming ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-md bg-background/95 text-xs">
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
            className="absolute top-1 right-1 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        ))}
    </li>
  )
}

/** "Ana tocou Buzina" enquanto o som toca na minha sala. */
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
