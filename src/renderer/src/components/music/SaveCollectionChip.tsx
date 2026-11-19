import { useState, type FormEvent } from 'react'
import { Button } from '@ui-sdk/react/button'
import { Field, FieldError, FieldLabel } from '@ui-sdk/react/field'
import { Input } from '@ui-sdk/react/input'
import { BookmarkPlus, Loader2, X } from 'lucide-react'
import { PLAYLIST_NAME_MAX, type MusicCollection } from '@shared/types'
import { dismissCollection, notify, savePlaylist } from '@/lib/client'
import { useApp } from '@/store'

export function SaveCollectionChip() {
  const collection = useApp((s) => {
    const { roomCollection, myVoiceChannelId } = s
    if (!roomCollection || roomCollection.channelId !== myVoiceChannelId) return null
    return s.musicRooms[roomCollection.channelId]?.nowPlaying ? roomCollection.collection : null
  })
  const alreadySaved = useApp((s) => s.playlists.some((p) => p.url === collection?.url))
  if (!collection || alreadySaved) return null
  return <CollectionInvite key={collection.url} collection={collection} />
}

function CollectionInvite({ collection }: { collection: MusicCollection }) {
  const [naming, setNaming] = useState(false)
  if (naming) return <SaveCollectionForm collection={collection} onCancel={() => setNaming(false)} />

  return (
    <div className="flex w-fit max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/10 py-1 pr-1 pl-3 text-sm text-accent-foreground animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none">
      <Button
        onClick={() => setNaming(true)}
        className="flex min-w-0 items-center gap-2 rounded-full font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <BookmarkPlus aria-hidden className="size-4 shrink-0 text-primary" />
        <span className="truncate">Salvar playlist “{collection.title}”</span>
      </Button>
      <Button
        aria-label="Dispensar"
        title="Dispensar"
        onClick={dismissCollection}
        className="rounded-full p-1 text-muted-foreground hover:bg-foreground/10 hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <X aria-hidden className="size-3.5" />
      </Button>
    </div>
  )
}

interface SaveCollectionFormProps {
  collection: MusicCollection
  onCancel: () => void
}

function SaveCollectionForm({ collection, onCancel }: SaveCollectionFormProps) {
  const [name, setName] = useState(collection.title.slice(0, PLAYLIST_NAME_MAX))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const trimmed = name.trim()

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!trimmed || saving) return
    setSaving(true)
    try {
      const playlist = await savePlaylist(trimmed, collection.url)
      dismissCollection()
      notify(`Playlist “${playlist.name}” salva`, 'info')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a playlist')
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(event) => void save(event)}
      className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 animate-in fade-in motion-reduce:animate-none"
    >
      <Field invalid={error ? true : undefined} className="flex flex-col gap-1.5">
        <FieldLabel className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Nome da playlist</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={name}
            maxLength={PLAYLIST_NAME_MAX}
            autoFocus
            onValueChange={(value) => {
              setName(value)
              setError(null)
            }}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-input px-3 text-sm text-foreground outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/20"
          />
          <Button
            type="submit"
            disabled={!trimmed || saving}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-disabled:opacity-50"
          >
            {saving && <Loader2 aria-hidden className="size-4 animate-spin" />}
            Salvar
          </Button>
          <Button
            onClick={onCancel}
            className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:bg-foreground/10 hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Cancelar
          </Button>
        </div>
        {error && (
          <FieldError match className="text-sm text-destructive">
            {error}
          </FieldError>
        )}
      </Field>
    </form>
  )
}
