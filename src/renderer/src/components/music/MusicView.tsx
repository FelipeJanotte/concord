import { useEffect } from 'react'
import { Headphones, Music } from 'lucide-react'
import { dismissCollection, loadMusicQueue, loadPlaylists } from '@/lib/client'
import { useApp } from '@/store'
import { MusicQueue } from './MusicQueue'
import { MusicRequestForm } from './MusicRequestForm'
import { NothingPlaying, NowPlaying } from './NowPlaying'
import { reportError } from './reportError'
import { PlaylistsDrawer } from './PlaylistsDrawer'
import { SaveCollectionChip } from './SaveCollectionChip'

export function MusicView() {
  const channelId = useApp((s) => s.myVoiceChannelId)
  const roomName = useApp((s) => s.channels.find((c) => c.id === s.myVoiceChannelId)?.name ?? null)

  useEffect(() => {
    loadPlaylists().catch(reportError('Não foi possível carregar as playlists'))
  }, [])

  useEffect(() => {
    const { roomCollection } = useApp.getState()
    if (roomCollection && roomCollection.channelId !== channelId) dismissCollection()
  }, [channelId])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4 shadow-sm">
        <Music aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        <h1 className="font-semibold text-accent-foreground">Música</h1>
        <span aria-hidden className="h-5 w-px bg-border" />
        <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{roomName ?? 'Fora de uma sala de voz'}</p>
        <PlaylistsDrawer channelId={channelId} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
          {channelId ? <RoomMusic key={channelId} channelId={channelId} /> : <RoomRequired />}
        </div>
      </div>
    </div>
  )
}

function RoomMusic({ channelId }: { channelId: string }) {
  const state = useApp((s) => s.musicRooms[channelId])

  useEffect(() => {
    loadMusicQueue(channelId).catch(reportError('Não foi possível carregar a fila'))
  }, [channelId])

  const track = state?.nowPlaying
  return (
    <>
      {state && track ? <NowPlaying state={state} track={track} /> : <NothingPlaying />}
      <div className="flex flex-col gap-3">
        <MusicRequestForm channelId={channelId} />
        <SaveCollectionChip />
      </div>
      {state && track && <MusicQueue queue={state.queue} />}
    </>
  )
}

function RoomRequired() {
  return (
    <>
      <section aria-label="Fora de uma sala de voz" className="relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl border border-border/60 bg-panel px-6 py-16 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 mx-auto size-72 rounded-full bg-primary/20 blur-3xl" />
        <span className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/40 text-primary-foreground shadow-lg shadow-primary/30">
          <Headphones aria-hidden className="size-9" />
        </span>
        <p className="relative text-xl font-bold text-accent-foreground">Entre numa sala de voz para ouvir música juntos</p>
        <p className="relative max-w-md text-sm text-muted-foreground">A música toca para todo mundo da sala. Escolha uma sala de voz na barra ao lado e volte aqui para pedir.</p>
      </section>
      <MusicRequestForm channelId={null} />
    </>
  )
}
