// Lista de conversas privadas na barra lateral da Home (B7/A7): a mais recente primeiro, com não lido e online.
import { Phone } from 'lucide-react'
import type { DmEntry } from '@shared/types'
import { openDmChat } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { UserAvatar } from '../UserAvatar'

export function DmList() {
  const dms = useApp((s) => s.dms)
  const loaded = useApp((s) => s.friendsLoaded)

  if (loaded && dms.length === 0) {
    return <p className="px-2 py-1 text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
  }
  return (
    <ul aria-label="Mensagens diretas" className="space-y-0.5">
      {dms.map((dm) => (
        <DmItem key={dm.channel.id} dm={dm} />
      ))}
    </ul>
  )
}

function DmItem({ dm }: { dm: DmEntry }) {
  const active = useApp((s) => s.section === 'home' && s.homeView.kind === 'dm' && s.homeView.channelId === dm.channel.id)
  const unread = useApp((s) => !!s.unread[dm.channel.id])
  // online só aparece para amigos (o servidor não conta para os outros)
  const inCall = useApp((s) => !!s.calls[dm.channel.id])
  const online = useApp((s) => s.friends.some((f) => f.account.id === dm.other.id && f.status === 'friend' && f.online))

  return (
    <li>
      <button
        onClick={() => openDmChat(dm.channel.id)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex h-11 w-full items-center gap-3 rounded-md px-2 text-left text-sidebar-foreground outline-none hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
          active && 'bg-accent text-accent-foreground hover:bg-accent',
          unread && !active && 'font-semibold text-accent-foreground'
        )}
      >
        {unread && !active && <span className="absolute -left-2 h-2 w-1 rounded-r-full bg-accent-foreground" />}
        <span className="relative shrink-0">
          <UserAvatar user={dm.other} />
          <span
            aria-label={online ? 'Online' : 'Offline'}
            className={cn(
              'absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-[3px] border-sidebar',
              online ? 'bg-success' : 'bg-muted-foreground'
            )}
          />
        </span>
        <span className="flex-1 truncate">{dm.other.name}</span>
        {inCall && <Phone aria-label="Em chamada" className="size-4 shrink-0 text-success" />}
      </button>
    </li>
  )
}
