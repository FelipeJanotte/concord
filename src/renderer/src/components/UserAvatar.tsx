import type { User } from '@shared/types'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { resolveAvatarUrl } from '@/lib/client'
import { STATUS_LABEL, type DotStatus } from '@/lib/presence'
import { cn, initials } from '@/lib/utils'
import { useApp } from '@/store'

const sizes = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
  xl: 'size-20 text-2xl'
}

interface Props {
  user: Pick<User, 'name' | 'color'> & { avatarUrl?: string | null }
  size?: keyof typeof sizes
  speaking?: boolean
  className?: string
}

export function UserAvatar({ user, size = 'md', speaking = false, className }: Props) {
  const serverUrl = useApp((s) => s.serverUrl)
  const src = resolveAvatarUrl(user.avatarUrl, serverUrl)

  return (
    <Avatar
      className={cn(
        sizes[size],
        'ring-2 ring-transparent ring-offset-0 transition-shadow',
        speaking && 'ring-primary',
        className
      )}
    >
      {src && <AvatarImage src={src} alt="" className="object-cover" />}
      <AvatarFallback className="font-semibold text-white" style={{ backgroundColor: user.color }}>
        {initials(user.name)}
      </AvatarFallback>
    </Avatar>
  )
}

const DOT_COLOR: Record<DotStatus, string> = {
  online: 'bg-success',
  idle: 'bg-idle',
  dnd: 'bg-destructive',
  offline: 'bg-muted-foreground'
}

export function StatusDot({ status, className }: { status: DotStatus; className?: string }) {
  return (
    <span
      role="img"
      aria-label={STATUS_LABEL[status]}
      title={STATUS_LABEL[status]}
      className={cn('absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-[3px]', DOT_COLOR[status], className)}
    />
  )
}
