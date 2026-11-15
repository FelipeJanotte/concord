// Overlay em jogos (B15): quem está na minha sala de voz, com quem está falando em destaque e
// microfone/áudio desligados. A janela não recebe cliques (o clique passa para o jogo).
import { useEffect, useState } from 'react'
import { HeadphoneOff, MicOff, Volume2 } from 'lucide-react'
import type { OverlayConfig, OverlayMember, OverlayRoom, OverlayViewBridge } from '@shared/overlay'
import { cn } from '@/lib/utils'

const SIZE = {
  small: { avatar: 'size-6 text-[10px]', name: 'text-xs', icon: 'size-3', header: 'text-[10px]' },
  medium: { avatar: 'size-8 text-xs', name: 'text-sm', icon: 'size-3.5', header: 'text-xs' },
  large: { avatar: 'size-10 text-sm', name: 'text-base', icon: 'size-4', header: 'text-sm' }
} as const

export function OverlayApp({ bridge }: { bridge: OverlayViewBridge | null }) {
  const [room, setRoom] = useState<OverlayRoom | null>(null)
  const [config, setConfig] = useState<OverlayConfig | null>(null)

  useEffect(
    () =>
      bridge?.onUpdate((nextRoom, nextConfig) => {
        setRoom(nextRoom)
        setConfig(nextConfig)
      }),
    [bridge]
  )

  if (!room || !config || room.members.length === 0) return null
  const s = SIZE[config.size]
  const bottom = config.corner.startsWith('bottom')
  const right = config.corner.endsWith('right')

  return (
    <div className={cn('flex h-screen flex-col gap-1 p-2 select-none', bottom && 'justify-end', right && 'items-end')}>
      <div className={cn('flex items-center gap-1 px-1 font-semibold text-foreground/80 drop-shadow', s.header)}>
        <Volume2 className={s.icon} />
        <span className="truncate">{room.channelName}</span>
      </div>
      <ul aria-label="Pessoas na sala" className={cn('flex flex-col gap-1', right && 'items-end')}>
        {room.members.map((m) => (
          <MemberRow key={m.id} member={m} size={s} />
        ))}
        {room.more > 0 && <li className={cn('px-2 text-foreground/70 drop-shadow', s.name)}>+{room.more}</li>}
      </ul>
    </div>
  )
}

function MemberRow({ member, size }: { member: OverlayMember; size: (typeof SIZE)[keyof typeof SIZE] }) {
  return (
    <li
      data-speaking={member.speaking || undefined}
      className="flex max-w-full items-center gap-2 rounded-full bg-background/75 py-1 pr-3 pl-1 text-foreground"
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ring-2 transition-shadow',
          size.avatar,
          member.speaking ? 'ring-success' : 'ring-transparent'
        )}
        style={member.avatarUrl ? undefined : { backgroundColor: member.color }}
      >
        {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="size-full object-cover" /> : member.name.slice(0, 1).toUpperCase()}
      </span>
      <span className={cn('truncate font-medium', size.name, member.speaking ? 'text-foreground' : 'text-foreground/80')}>{member.name}</span>
      {member.deafened ? (
        <HeadphoneOff aria-label="Áudio desativado" className={cn('shrink-0 text-destructive', size.icon)} />
      ) : member.muted ? (
        <MicOff aria-label="Microfone desligado" className={cn('shrink-0 text-destructive', size.icon)} />
      ) : null}
    </li>
  )
}
