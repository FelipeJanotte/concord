// Grade da sala de voz: participantes (com a câmera no quadro, B21) e as telas compartilhadas. Com
// alguém compartilhando, uma tela fica em destaque (`ScreenStage`: barra "Assistindo", seletor das
// telas ao vivo, tela cheia, esconder/mostrar membros) e a fileira de membros centralizada embaixo; "Ver grade" mostra todas lado a lado, e clicar numa tela (ou no "Ao vivo"
// de uma pessoa) volta a assistir aquela em destaque.
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { HeadphoneOff, MicOff, VolumeX } from 'lucide-react'
import type { VoiceState } from '@shared/types'
import { UserAvatar } from '@/components/UserAvatar'
import { bestTileLayout, useElementSize } from '@/lib/tile-layout'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { CameraVideo } from './CameraTile'
import { MemberContextMenu } from './MemberContextMenu'
import { ServerMutedIcon } from './ModerationMenu'
import { LiveBadge, ScreenStage, ScreenTile } from './ScreenTile'

/**
 * Qual tela fica em destaque: a escolhida (se ainda está ao vivo); senão a primeira de outra pessoa
 * (a própria só se for a única). `null` = sem telas ou a pessoa pediu a grade.
 */
export function featuredScreen(screens: string[], selfId: string | undefined, chosen: string | null, grid: boolean): string | null {
  if (grid || screens.length === 0) return null
  if (chosen && screens.includes(chosen)) return chosen
  return screens.find((id) => id !== selfId) ?? screens[0]
}

/** Sem altura definida (painel da chamada privada), os quadros não passam disso. */
const MAX_TILE_WITHOUT_HEIGHT = 320

/**
 * Quadros centralizados (na horizontal e na vertical) com o tamanho calculado pelo espaço disponível
 * (`bestTileLayout`): poucas pessoas = quadros grandes; muitas = menores, e a última linha fica no meio.
 * `fill` = a grade ocupa a altura do pai (sala de voz); sem isso, só a largura conta.
 */
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
        // "safe center": com mais quadros do que cabem, começa do topo (rola) em vez de cortar em cima
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
  const [chosen, setChosen] = useState<string | null>(null)
  const [grid, setGrid] = useState(false)
  const [membersHidden, setMembersHidden] = useState(false)

  const watch = (id: string): void => {
    setChosen(id)
    setGrid(false)
  }
  /** quem compartilha e está com a tela chegando: o "Ao vivo" do quadro dela vira "Assistir" */
  const watchable = (userId: string): (() => void) | undefined => (screens.includes(userId) ? () => watch(userId) : undefined)

  const featured = featuredScreen(screens, selfId, chosen, grid)

  if (!featured) {
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

  const others = screens.filter((id) => id !== featured)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ScreenStage
        userId={featured}
        screens={screens}
        onSelect={watch}
        onShowGrid={() => setGrid(true)}
        membersHidden={membersHidden}
        onToggleMembers={() => setMembersHidden((h) => !h)}
      />
      {!membersHidden && (
        // centralizada: margens automáticas no primeiro e no último (em vez de justify-center), para não cortar o
        // começo da fileira quando ela rola de lado
        <div
          role="group"
          aria-label="Membros da chamada"
          className="flex shrink-0 gap-3 overflow-x-auto pb-1 [&>*]:w-48 [&>*]:shrink-0 [&>*:first-child]:ml-auto [&>*:last-child]:mr-auto"
        >
          {others.map((id) => (
            <ScreenTile key={`tela-${id}`} userId={id} onSelect={() => watch(id)} />
          ))}
          {members.map((m) => (
            <ParticipantTile key={m.userId} state={m} compact onWatch={m.userId === featured ? undefined : watchable(m.userId)} />
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
