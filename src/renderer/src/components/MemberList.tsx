import { Volume2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { User } from '@shared/types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { rolesByPosition, topRole, useNameColor } from '@/lib/permissions'
import { useApp } from '@/store'
import { UserAvatar } from './UserAvatar'
import { MemberContextMenu } from './voice/MemberContextMenu'

/** Grupo da lista: um por cargo (pelo cargo mais alto de cada pessoa) e "Online" para quem não tem cargo. */
interface Group {
  key: string
  title: string
  users: User[]
}

export function MemberList() {
  const allUsers = useApp(useShallow((s) => s.users))
  const access = useApp((s) => s.access)
  // A mesma conta pode estar conectada em mais de um lugar: mostra uma vez só.
  const users = [...new Map(allUsers.map((u) => [u.accountId, u])).values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR')
  )

  const byRole = new Map<string, User[]>()
  const noRole: User[] = []
  for (const u of users) {
    const role = topRole(access, u.accountId)
    if (role) byRole.set(role.id, [...(byRole.get(role.id) ?? []), u])
    else noRole.push(u)
  }
  const groups: Group[] = [
    ...rolesByPosition(access)
      .filter((r) => byRole.has(r.id))
      .map((r) => ({ key: r.id, title: r.name, users: byRole.get(r.id) ?? [] })),
    ...(noRole.length > 0 ? [{ key: 'online', title: 'Online', users: noRole }] : [])
  ]

  return (
    <aside data-glass="panel" className="flex min-w-0 flex-1 flex-col bg-sidebar">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-2 py-4">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.title}>
              <h3 className="truncate px-2 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {g.title} — {g.users.length}
              </h3>
              {g.users.map((u) => (
                <MemberItem key={u.accountId} user={u} />
              ))}
            </section>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}

function MemberItem({ user }: { user: User }) {
  const inVoice = useApp((s) => s.voice.some((v) => s.users.find((u) => u.id === v.userId)?.accountId === user.accountId))
  const isSelf = useApp((s) => s.self?.accountId === user.accountId)
  const color = useNameColor(user.accountId, user.color)

  return (
    <MemberContextMenu userId={user.id}>
      <div className="flex h-11 items-center gap-3 rounded-md px-2 hover:bg-accent/50">
        <div className="relative">
          <UserAvatar user={user} />
          <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-[3px] border-sidebar bg-success" />
        </div>
        <span className="flex-1 truncate font-medium" style={{ color }} title={`${user.name}#${user.tag}`}>
          {user.name}
          {isSelf && <span className="ml-1 text-xs font-normal text-muted-foreground">(você)</span>}
        </span>
        {inVoice && <Volume2 className="size-4 text-muted-foreground" />}
      </div>
    </MemberContextMenu>
  )
}
