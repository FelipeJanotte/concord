import { Volume2 } from 'lucide-react'
import type { User } from '@shared/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useApp } from '@/store'
import { UserAvatar } from './UserAvatar'

export function MemberList() {
  const allUsers = useApp((s) => s.users)
  // A mesma conta pode estar conectada em mais de um lugar: mostra uma vez só.
  const users = [...new Map(allUsers.map((u) => [u.accountId, u])).values()]
  const sorted = users.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-sidebar lg:flex">
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 py-4">
          <h3 className="px-2 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Online — {users.length}
          </h3>
          {sorted.map((u) => (
            <MemberItem key={u.accountId} user={u} />
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}

function MemberItem({ user }: { user: User }) {
  const inVoice = useApp((s) => s.voice.some((v) => s.users.find((u) => u.id === v.userId)?.accountId === user.accountId))
  const isSelf = useApp((s) => s.self?.accountId === user.accountId)

  return (
    <div className="flex h-11 items-center gap-3 rounded-md px-2 hover:bg-accent/50">
      <div className="relative">
        <UserAvatar user={user} />
        <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-[3px] border-sidebar bg-success" />
      </div>
      <span className="flex-1 truncate font-medium" style={{ color: user.color }} title={`${user.name}#${user.tag}`}>
        {user.name}
        {isSelf && <span className="ml-1 text-xs font-normal text-muted-foreground">(você)</span>}
      </span>
      {inVoice && <Volume2 className="size-4 text-muted-foreground" />}
    </div>
  )
}
