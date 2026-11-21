import { useState } from 'react'
import { AlertDialog, AlertDialogBackdrop, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from '@ui-sdk/react/alert-dialog'
import { Button } from '@ui-sdk/react/button'
import { Drawer, DrawerBackdrop, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from '@ui-sdk/react/drawer'
import { Disc3, ListMusic, Loader2, Play, Trash2, X } from 'lucide-react'
import type { SavedPlaylist } from '@shared/types'
import { deletePlaylist, loadPlaylists, playMusic } from '@/lib/client'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { reportError } from './reportError'

const KIND_LABEL: Record<SavedPlaylist['kind'], string> = { playlist: 'Playlist', album: 'Álbum' }

const ICON_BUTTON =
  'flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-disabled:pointer-events-none data-disabled:opacity-40 [&_svg]:size-4'

export function PlaylistsDrawer({ channelId }: { channelId: string | null }) {
  const [open, setOpen] = useState(false)

  function changeOpen(next: boolean): void {
    setOpen(next)
    if (next) loadPlaylists().catch(reportError('Não foi possível carregar as playlists'))
  }

  return (
    <Drawer side="right" open={open} onOpenChange={changeOpen}>
      <DrawerTrigger
        title="Playlists da comunidade"
        className="flex h-[3.25rem] shrink-0 items-center gap-2 rounded-xl border border-border bg-composer px-4 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-open:border-primary/60 data-open:text-primary"
      >
        <ListMusic aria-hidden className="size-5" />
        Playlists
      </DrawerTrigger>
      <DrawerBackdrop className="bg-background/60" />
      <DrawerContent data-glass="surface" className="flex h-full w-[min(400px,92vw)] flex-col border-l border-border bg-popover text-popover-foreground shadow-2xl">
        <header className="flex items-start gap-3 border-b border-border p-5">
          <div className="min-w-0 flex-1">
            <DrawerTitle className="text-lg font-bold text-accent-foreground">Playlists da comunidade</DrawerTitle>
            <DrawerDescription className="mt-1 text-sm text-muted-foreground">Playlists e álbuns salvos por todos. Toque um na sua sala de voz.</DrawerDescription>
          </div>
          <DrawerClose aria-label="Fechar" title="Fechar" className={ICON_BUTTON}>
            <X aria-hidden />
          </DrawerClose>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <SavedPlaylists channelId={channelId} onPlayed={() => setOpen(false)} />
        </div>
      </DrawerContent>
    </Drawer>
  )
}

interface SavedPlaylistsProps {
  channelId: string | null
  onPlayed: () => void
}

function SavedPlaylists({ channelId, onPlayed }: SavedPlaylistsProps) {
  const playlists = useApp((s) => s.playlists)
  const loaded = useApp((s) => s.playlistsLoaded)

  if (!loaded) {
    return (
      <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        Carregando…
      </p>
    )
  }

  if (playlists.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-primary/5 text-primary">
          <ListMusic aria-hidden className="size-7" />
        </span>
        <p className="font-semibold text-accent-foreground">Nenhuma playlist salva ainda</p>
        <p className="text-sm text-muted-foreground">Toque o link de uma playlist ou álbum do Spotify ou do YouTube e use “Salvar playlist” para guardá-la aqui para todos.</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-1">
      {playlists.map((playlist) => (
        <PlaylistRow key={playlist.id} playlist={playlist} channelId={channelId} onPlayed={onPlayed} />
      ))}
    </ul>
  )
}

interface PlaylistRowProps {
  playlist: SavedPlaylist
  channelId: string | null
  onPlayed: () => void
}

function PlaylistRow({ playlist, channelId, onPlayed }: PlaylistRowProps) {
  const mine = useApp((s) => s.self?.accountId === playlist.savedBy.accountId)
  const managesMessages = useCan('manageMessages')
  const KindIcon = playlist.kind === 'album' ? Disc3 : ListMusic

  async function play(): Promise<void> {
    if (!channelId) return
    try {
      await playMusic(channelId, playlist.url)
      onPlayed()
    } catch (err) {
      reportError('Não foi possível tocar a playlist')(err)
    }
  }

  return (
    <li className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-foreground/5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/50 to-secondary text-primary-foreground">
        <KindIcon aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-accent-foreground" title={playlist.name}>
          {playlist.name}
        </p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <span className="rounded bg-secondary px-1.5 text-[10px] leading-4 font-semibold tracking-wide text-secondary-foreground uppercase">{KIND_LABEL[playlist.kind]}</span>
          salva por {playlist.savedBy.name}
        </p>
      </div>
      <Button
        aria-label={`Tocar ${playlist.name}`}
        title={channelId ? 'Tocar na minha sala' : 'Entre numa sala de voz para tocar'}
        disabled={!channelId}
        pendingAnnouncement=""
        onClick={play}
        className={cn(ICON_BUTTON, 'size-9 bg-primary text-primary-foreground opacity-90 hover:bg-primary hover:text-primary-foreground hover:opacity-100 data-pending:opacity-60 [&_svg]:fill-current')}
      >
        <Play aria-hidden />
      </Button>
      {(mine || managesMessages) && <DeletePlaylistButton playlist={playlist} />}
    </li>
  )
}

function DeletePlaylistButton({ playlist }: { playlist: SavedPlaylist }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger aria-label={`Apagar ${playlist.name}`} title="Apagar" className={cn(ICON_BUTTON, 'hover:text-destructive')}>
        <Trash2 aria-hidden />
      </AlertDialogTrigger>
      <AlertDialogBackdrop className="bg-background/70 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <AlertDialogContent
        data-glass="surface"
        className="w-[min(420px,90vw)] rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
      >
        <AlertDialogTitle className="text-base font-bold text-accent-foreground">Apagar “{playlist.name}”?</AlertDialogTitle>
        <AlertDialogDescription className="mt-2 text-sm text-muted-foreground">
          Ela sai das playlists da comunidade para todos. O que já está tocando continua.
        </AlertDialogDescription>
        <div className="mt-5 flex justify-end gap-2">
          <AlertDialogClose className="h-9 rounded-lg px-4 text-sm text-foreground hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Cancelar
          </AlertDialogClose>
          <AlertDialogClose
            value="confirm"
            action={() => deletePlaylist(playlist.id).catch(reportError('Não foi possível apagar a playlist'))}
            className="h-9 rounded-lg bg-destructive px-4 text-sm font-semibold text-white hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-pending:opacity-60"
          >
            Apagar
          </AlertDialogClose>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
