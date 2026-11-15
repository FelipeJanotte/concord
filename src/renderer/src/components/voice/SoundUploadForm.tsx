// Enviar um som para a coleção (B17): escolher o arquivo, ouvir a prévia, nome e emoji (escolhido na grade).
// O app confere tamanho e duração antes; o servidor confere tudo de novo (tipo pelos bytes).
import { useEffect, useState, type FormEvent } from 'react'
import { Loader2, Volume2 } from 'lucide-react'
import { SOUND_NAME_MAX } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { checkSoundFile, soundNameFromFile, uploadSound } from '@/lib/client'
import { EmojiPicker } from './EmojiPicker'

const ACCEPT = 'audio/mpeg,audio/ogg,audio/wav,audio/x-wav,audio/webm,.mp3,.ogg,.wav,.webm'

export function SoundUploadForm({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // a prévia usa um endereço local do arquivo; solta quando troca ou fecha
  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function choose(picked: File | undefined): Promise<void> {
    setError(null)
    setFile(null)
    if (!picked) return
    const problem = await checkSoundFile(picked)
    if (problem) return setError(problem)
    setFile(picked)
    if (!name.trim()) setName(soundNameFromFile(picked.name))
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await uploadSound({ file, name, emoji })
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
        <Label htmlFor="sound-file">Arquivo (MP3, OGG, WAV ou WebM, até 5 s e 512 KB)</Label>
        <input
          id="sound-file"
          type="file"
          accept={ACCEPT}
          onChange={(e) => void choose(e.target.files?.[0])}
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
        />
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
        <Button type="submit" disabled={!file || !name.trim() || busy}>
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
