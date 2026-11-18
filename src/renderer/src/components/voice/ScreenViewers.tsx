import { Eye } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { User } from '@shared/types'
import { UserAvatar } from '@/components/UserAvatar'
import { screenViewers } from '@/lib/featured-screens'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

const MAX_AVATARS = 3
const listFormat = new Intl.ListFormat('pt-BR', { type: 'conjunction' })

export function ScreenViewers({ userId, className }: { userId: string; className?: string }) {
  const viewers = useApp(useShallow((s) => screenViewers(s.voice, userId).flatMap((id): User[] => s.users.filter((u) => u.id === id))))
  const label = viewers.length === 0 ? 'Ninguém assistindo' : `Assistindo: ${listFormat.format(viewers.map((u) => u.name))}`
  return (
    <span title={label} className={cn('flex min-w-0 items-center gap-1.5 text-xs', className)}>
      <Eye className="size-3.5 shrink-0" />
      {viewers.length > 0 && (
        <span className="flex shrink-0 -space-x-1">
          {viewers.slice(0, MAX_AVATARS).map((u) => (
            <UserAvatar key={u.id} user={u} size="sm" />
          ))}
        </span>
      )}
      <span className="truncate">{label}</span>
    </span>
  )
}
