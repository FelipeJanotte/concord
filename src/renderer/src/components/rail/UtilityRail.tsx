import type { ReactNode } from 'react'
import { LayoutGrid, MessageCircle, Music } from 'lucide-react'
import { ConcordLogo } from '@/components/ConcordLogo'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { showCommunity, showHome, showMusic, showPokemon, showTools } from '@/lib/client'
import { communityUnread, homeBadge } from '@/lib/home'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { PokeballIcon } from '@/components/pokemon/PokeballIcon'
import { UpdateCheckButton, UpdateRailSlot } from './UpdateButton'

export function UtilityRail() {
  const section = useApp((s) => s.section)
  const serverUrl = useApp((s) => s.serverUrl)
  const badge = useApp((s) => homeBadge(s.friends, s.dms, s.unread))
  const communityDot = useApp((s) => communityUnread(s.channels.map((c) => c.id), s.unread))

  return (
    <nav aria-label="Barra de úteis" data-glass="panel" className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-rail py-3">
      <UpdateRailSlot />
      <RailButton
        label="Início"
        hint="Amigos e mensagens diretas"
        active={section === 'home'}
        badge={badge}
        onClick={showHome}
      >
        <MessageCircle className="size-6" />
      </RailButton>
      <RailButton
        label="Concord"
        hint={serverUrl ?? undefined}
        active={section === 'community'}
        dot={communityDot && section !== 'community'}
        surface="logo"
        onClick={showCommunity}
      >
        <ConcordLogo className="size-7" />
      </RailButton>
      <Separator className="mx-auto w-8" />
      <RailButton label="Ferramentas" active={section === 'tool'} onClick={showTools}>
        <LayoutGrid className="size-6" />
      </RailButton>
      <RailButton label="Música" active={section === 'music'} onClick={showMusic}>
        <Music className="size-6" />
      </RailButton>
      <RailButton label="Pokémon" active={section === 'pokemon'} onClick={showPokemon}>
        <PokeballIcon className="size-6" />
      </RailButton>
      <UpdateCheckButton />
    </nav>
  )
}

interface RailButtonProps {
  label: string
  hint?: string
  active: boolean
  badge?: number
  dot?: boolean
  surface?: RailSurface
  onClick: () => void
  children: ReactNode
}

type RailSurface = keyof typeof RAIL_SURFACE

const RAIL_SURFACE = {
  icon: {
    active: 'bg-primary text-primary-foreground',
    idle: 'bg-sidebar text-accent-foreground hover:bg-primary hover:text-primary-foreground'
  },
  logo: { active: 'bg-accent', idle: 'bg-sidebar hover:bg-accent' }
}

function RailButton({ label, hint, active, badge = 0, dot = false, surface = 'icon', onClick, children }: RailButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={badge > 0 ? `${label} (${badge})` : label}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'group relative flex size-12 items-center justify-center rounded-3xl transition-all duration-150',
            active ? cn('rounded-2xl', RAIL_SURFACE[surface].active) : cn('hover:rounded-2xl', RAIL_SURFACE[surface].idle)
          )}
        >
          <span
            className={cn(
              'absolute -left-3 w-1 rounded-r-full bg-accent-foreground transition-all',
              active ? 'h-10' : dot ? 'h-2' : 'h-0 group-hover:h-5'
            )}
          />
          {children}
          {badge > 0 && (
            <span className="absolute -right-1 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-full border-4 border-rail bg-destructive px-1 text-[10px] font-bold text-white">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <div className="font-semibold">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </TooltipContent>
    </Tooltip>
  )
}
