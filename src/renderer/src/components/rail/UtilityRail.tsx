/**
 * Barra de úteis (B7): a barra da esquerda. No topo, Home (Amigos + conversas) e a Comunidade
 * (canais); abaixo do separador, as ferramentas do registro (`components/tools/registry.ts`).
 */
import type { ReactNode } from 'react'
import { MessageCircle } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TOOLS, type ToolDefinition } from '@/components/tools/registry'
import { openTool, showCommunity, showHome } from '@/lib/client'
import { communityUnread, homeBadge } from '@/lib/home'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { UpdateRailSlot } from './UpdateButton'

export function UtilityRail({ tools = TOOLS }: { tools?: readonly ToolDefinition[] }) {
  const section = useApp((s) => s.section)
  const toolId = useApp((s) => s.toolId)
  const serverUrl = useApp((s) => s.serverUrl)
  const badge = useApp((s) => homeBadge(s.friends, s.dms, s.unread))
  const communityDot = useApp((s) => communityUnread(s.channels.map((c) => c.id), s.unread))

  return (
    <nav aria-label="Barra de úteis" className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-rail py-3">
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
        onClick={showCommunity}
      >
        <span className="text-lg font-bold">C</span>
      </RailButton>
      <Separator className="mx-auto w-8" />
      {tools.map((tool) => {
        const Icon = tool.icon
        return (
          <RailButton
            key={tool.id}
            label={tool.name}
            active={section === 'tool' && toolId === tool.id}
            onClick={() => openTool(tool.id)}
          >
            <Icon className="size-6" />
          </RailButton>
        )
      })}
    </nav>
  )
}

interface RailButtonProps {
  label: string
  hint?: string
  active: boolean
  /** número no canto (pedidos e conversas não lidas) */
  badge?: number
  /** bolinha à esquerda (algo não lido) */
  dot?: boolean
  onClick: () => void
  children: ReactNode
}

function RailButton({ label, hint, active, badge = 0, dot = false, onClick, children }: RailButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={badge > 0 ? `${label} (${badge})` : label}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'group relative flex size-12 items-center justify-center rounded-3xl transition-all duration-150',
            active
              ? 'rounded-2xl bg-primary text-primary-foreground'
              : 'bg-sidebar text-accent-foreground hover:rounded-2xl hover:bg-primary hover:text-primary-foreground'
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
