import { useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fileToAvatarDataUrl } from '@/lib/image'
import { UserAvatar } from './UserAvatar'

interface Props {
  name: string
  color: string
  /** caminho no servidor, data URL ou null */
  value: string | null
  onChange: (dataUrl: string | null) => void
}

/** Foto de perfil clicável + botões para trocar/remover. */
export function AvatarPicker({ name, color, value, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      onChange(await fileToAvatarDataUrl(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Imagem inválida')
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative rounded-full"
        aria-label="Escolher foto de perfil"
      >
        <UserAvatar user={{ name: name || '?', color, avatarUrl: value }} size="xl" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Camera className="size-6" />
        </span>
      </button>
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => input.current?.click()}>
            {value ? 'Trocar foto' : 'Adicionar foto'}
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
              <Trash2 />
              Remover
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPG, WebP ou GIF. A imagem é recortada em quadrado.</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
