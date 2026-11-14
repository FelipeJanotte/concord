// Grade da sala de voz: participantes e, quando alguém compartilha, a tela em destaque.
import { useState } from 'react'
import { HeadphoneOff, MicOff, VolumeX } from 'lucide-react'
import type { VoiceState } from '@shared/types'
import { UserAvatar } from '@/components/UserAvatar'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { MemberContextMenu } from './MemberContextMenu'
import { LiveBadge, ScreenTile } from './ScreenTile'

export function VoiceGrid({ members }: { members: VoiceState[] }) {
  const screens = useApp((s) => s.screens)
  const selfId = useApp((s) => s.self?.id)
  const [chosen, setChosen] = useState<string | null>(null)

  if (screens.length === 0) {
    return (
      <div className="grid content-center gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {members.map((m) => (
          <ParticipantTile key={m.userId} state={m} />
        ))}
      </div>
    )
  }

  // Em destaque: a tela escolhida; se ela acabou, a primeira de outra pessoa (a própria só se for a única).
  const featured =
    (chosen && screens.includes(chosen) ? chosen : null) ?? screens.find((id) => id !== selfId) ?? screens[0]
  const others = screens.filter((id) => id !== featured)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ScreenTile key={featured} userId={featured} featured />
      <div className="flex shrink-0 gap-3 overflow-x-auto pb-1 [&>*]:w-48 [&>*]:shrink-0">
        {others.map((id) => (
          <ScreenTile key={id} userId={id} onSelect={() => setChosen(id)} />
        ))}
        {members.map((m) => (
          <ParticipantTile key={m.userId} state={m} compact />
        ))}
      </div>
    </div>
  )
}

export function ParticipantTile({ state, compact = false }: { state: VoiceState; compact?: boolean }) {
  const user = useApp((s) => s.users.find((u) => u.id === state.userId))
  const speaking = useApp((s) => !!s.speaking[state.userId])
  const isSelf = useApp((s) => s.self?.id === state.userId)
  const mutedByMe = useApp((s) => !!user && !!s.userMuted[user.accountId])
  if (!user) return null

  return (
    <MemberContextMenu userId={state.userId}>
      <div
        className={cn(
          'relative flex aspect-video items-center justify-center rounded-lg bg-background ring-2 ring-transparent transition-shadow',
          speaking && 'ring-success'
        )}
      >
        <UserAvatar user={user} size={compact ? 'lg' : 'xl'} />
        {state.sharing && <LiveBadge className="absolute top-2 right-2" />}
        <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/50 px-2 py-0.5 text-sm text-white">
          {state.deafened ? (
            <HeadphoneOff className="size-3.5 shrink-0 text-destructive" />
          ) : state.muted ? (
            <MicOff className="size-3.5 shrink-0 text-destructive" />
          ) : null}
          {mutedByMe && <VolumeX className="size-3.5 shrink-0 text-destructive" aria-label="Silenciado por você" />}
          <span className="truncate">{user.name}</span>
          {isSelf && <span className="text-white/60">(você)</span>}
        </div>
      </div>
    </MemberContextMenu>
  )
}
