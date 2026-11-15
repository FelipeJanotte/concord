import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { HeadphoneOff, MicOff, VolumeX } from 'lucide-react'
import type { VoiceState } from '@shared/types'
import { UserAvatar } from '@/components/UserAvatar'
import { featuredScreens, moveScreen, toggleFeatured } from '@/lib/featured-screens'
import { bestTileLayout, useElementSize } from '@/lib/tile-layout'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { CameraVideo } from './CameraTile'
import { MemberContextMenu } from './MemberContextMenu'
import { ServerMutedIcon } from './ModerationMenu'
import { LiveBadge, ScreenStage, ScreenTile, type ScreenArrangement } from './ScreenTile'

const MAX_TILE_WITHOUT_HEIGHT = 320

function TileGrid({ count, fill, children }: { count: number; fill: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { width, height } = useElementSize(ref)
  const layout = width > 0 ? bestTileLayout(count, width, fill && height > 0 ? height : Infinity, fill ? {} : { maxWidth: MAX_TILE_WITHOUT_HEIGHT }) : null
  return (
    <div
      ref={ref}
      data-tile-grid=""
      data-columns={layout?.columns}
      style={layout ? ({ '--tile-w': `${layout.width}px` } as CSSProperties) : undefined}
      className={cn(
        'flex flex-wrap justify-center gap-4 [align-content:safe_center] [&>*]:w-[var(--tile-w,240px)] [&>*]:max-w-full',
        fill && 'h-full min-h-0'
      )}
    >
      {children}
    </div>
  )
}

export function VoiceGrid({ members, fill = true }: { members: VoiceState[]; fill?: boolean }) {
  const screens = useApp((s) => s.screens)
  const selfId = useApp((s) => s.self?.id)
  const [chosen, setChosen] = useState<string[]>([])
  const [grid, setGrid] = useState(false)
  const [membersHidden, setMembersHidden] = useState(false)
  const [arrangement, setArrangement] = useState<ScreenArrangement>('side-by-side')

  const featured = featuredScreens(screens, selfId, chosen, grid)

  const watch = (id: string): void => {
    setChosen([id])
    setGrid(false)
  }
  const watchable = (userId: string): (() => void) | undefined =>
    screens.includes(userId) && !featured.includes(userId) ? () => watch(userId) : undefined

  if (featured.length === 0) {
    return (
      <TileGrid count={screens.length + members.length} fill={fill}>
        {screens.map((id) => (
          <ScreenTile key={`tela-${id}`} userId={id} onSelect={() => watch(id)} />
        ))}
        {members.map((m) => (
          <ParticipantTile key={m.userId} state={m} onWatch={watchable(m.userId)} />
        ))}
      </TileGrid>
    )
  }

  const others = screens.filter((id) => !featured.includes(id))

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ScreenStage
        featured={featured}
        screens={screens}
        onToggle={(id) => setChosen(toggleFeatured(featured, id))}
        onMove={(dragged, target) => setChosen(moveScreen(featured, dragged, target))}
        arrangement={arrangement}
        onToggleArrangement={() => setArrangement((a) => (a === 'side-by-side' ? 'stacked' : 'side-by-side'))}
        onShowGrid={() => setGrid(true)}
        membersHidden={membersHidden}
        onToggleMembers={() => setMembersHidden((h) => !h)}
      />
      {!membersHidden && (
        <div
          role="group"
          aria-label="Membros da chamada"
          className="flex shrink-0 gap-3 overflow-x-auto pb-1 [&>*]:w-48 [&>*]:shrink-0 [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto"
        >
          {others.map((id) => (
            <ScreenTile key={`tela-${id}`} userId={id} onSelect={() => watch(id)} />
          ))}
          {members.map((m) => (
            <ParticipantTile key={m.userId} state={m} compact onWatch={watchable(m.userId)} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ParticipantTile({ state, compact = false, onWatch }: { state: VoiceState; compact?: boolean; onWatch?: () => void }) {
  const user = useApp((s) => s.users.find((u) => u.id === state.userId))
  const speaking = useApp((s) => !!s.speaking[state.userId])
  const isSelf = useApp((s) => s.self?.id === state.userId)
  const mutedByMe = useApp((s) => !!user && !!s.userMuted[user.accountId])
  const camera = useApp((s) => s.cameras.includes(state.userId))
  if (!user) return null

  return (
    <MemberContextMenu userId={state.userId}>
      <div
        className={cn(
          'relative flex aspect-video items-center justify-center rounded-lg bg-background ring-2 ring-transparent transition-shadow',
          speaking && 'ring-success'
        )}
      >
        {camera ? <CameraVideo userId={state.userId} name={user.name} self={isSelf} /> : <UserAvatar user={user} size={compact ? 'lg' : 'xl'} />}
        {state.sharing &&
          (onWatch ? (
            <button
              type="button"
              onClick={onWatch}
              aria-label={`Assistir a tela de ${user.name}`}
              title="Assistir a tela"
              className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/60 py-0.5 pr-2 pl-0.5 text-[11px] font-semibold text-white hover:bg-black/80"
            >
              <LiveBadge />
              Assistir
            </button>
          ) : (
            <LiveBadge className="absolute top-2 right-2" />
          ))}
        <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/50 px-2 py-0.5 text-sm text-white">
          {state.serverMuted && <ServerMutedIcon />}
          {state.deafened ? (
            <HeadphoneOff className="size-3.5 shrink-0 text-destructive" />
          ) : state.muted && !state.serverMuted ? (
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
