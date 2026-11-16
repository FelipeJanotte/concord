import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Loader2, Volume2 } from 'lucide-react'
import { SOUND_NAME_MAX } from '@shared/types'
import { clipWindow, maxClipStartMs, type DecodedAudio } from '@shared/sound-clip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clipSound, inspectSoundFile, soundNameFromFile, uploadSound } from '@/lib/client'
import { EmojiPicker } from './EmojiPicker'

const ACCEPT = 'audio/mpeg,audio/ogg,audio/wav,audio/x-wav,audio/webm,.mp3,.ogg,.wav,.webm'

interface Clip {
  audio: DecodedAudio
  durationMs: number
}

const seconds = (ms: number): string =>
  `${(ms / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`

export function SoundUploadForm({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [clip, setClip] = useState<Clip | null>(null)
  const [clipStartMs, setClipStartMs] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const upload = useMemo(() => (clip ? clipSound(clip.audio, clipStartMs) : file), [clip, clipStartMs, file])

  useEffect(() => {
    if (!upload) return setPreview(null)
    const url = URL.createObjectURL(upload)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [upload])

  async function choose(picked: File | undefined): Promise<void> {
    setError(null)
    setFile(null)
    setClip(null)
    setClipStartMs(0)
    if (!picked) return
    const inspection = await inspectSoundFile(picked)
    if (inspection.kind === 'error') return setError(inspection.error)
    if (inspection.kind === 'clip') setClip({ audio: inspection.audio, durationMs: inspection.durationMs })
    setFile(picked)
    if (!name.trim()) setName(soundNameFromFile(picked.name))
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!upload) return
    setBusy(true)
    setError(null)
    try {
      await uploadSound({ file: upload, name, emoji })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o som')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sound-file">Arquivo (MP3, OGG, WAV ou WebM; mais de 5 s: escolha o trecho)</Label>
        <input
          id="sound-file"
          type="file"
          accept={ACCEPT}
          onChange={(e) => void choose(e.target.files?.[0])}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
        />
        {clip && <ClipPicker clip={clip} startMs={clipStartMs} onChange={setClipStartMs} />}
        {preview && <audio controls src={preview} aria-label="Prévia do som" className="mt-1 w-full" />}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sound-name">Nome</Label>
        <div className="flex items-center gap-2">
          <span
            aria-label={emoji ? `Emoji escolhido: ${emoji}` : 'Sem emoji'}
            className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-xl"
          >
            {emoji || <Volume2 className="size-5 text-muted-foreground" />}
          </span>
          <Input id="sound-name" value={name} maxLength={SOUND_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="Buzina" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Emoji (opcional: clique para escolher, de novo para tirar)</span>
        <EmojiPicker value={emoji} onChange={setEmoji} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={!upload || !name.trim() || busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Enviar
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Voltar
        </Button>
      </div>
    </form>
  )
}

function ClipPicker({ clip, startMs, onChange }: { clip: Clip; startMs: number; onChange: (ms: number) => void }) {
  const span = clipWindow(clip.durationMs, startMs)
  const maxStart = maxClipStartMs(clip.durationMs)
  return (
    <div className="mt-1 flex flex-col gap-1.5 rounded-md bg-accent/50 p-2">
      <p className="text-xs text-muted-foreground">
        Trecho de {seconds(span.startMs)} a {seconds(span.endMs)} (de {seconds(clip.durationMs)})
      </p>
      {maxStart > 0 && (
        <input
          type="range"
          aria-label="Início do trecho"
          min={0}
          max={maxStart}
          step={100}
          value={span.startMs}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-primary"
        />
      )}
    </div>
  )
}
