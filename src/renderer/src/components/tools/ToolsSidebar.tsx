import { LayoutGrid } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { openTool, showToolGallery } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { UserPanel, VoiceStatusPanel } from '../UserPanel'
import { TOOL_GROUPS, toolsInGroup, TOOLS, type ToolDefinition } from './registry'

const buttonClasses =
  'flex h-10 w-full items-center gap-3 rounded-md px-2 text-left font-medium text-sidebar-foreground outline-none hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
const selectedClasses = 'bg-accent text-accent-foreground hover:bg-accent'

export function ToolsSidebar({ tools = TOOLS }: { tools?: readonly ToolDefinition[] }) {
  const openToolId = useApp((s) => s.toolId)
  const onGallery = openToolId === null

  return (
    <aside data-glass="panel" className="flex min-w-0 flex-1 flex-col bg-sidebar">
      <header className="flex h-12 shrink-0 items-center border-b border-black/25 px-2 shadow-sm">
        <button
          onClick={showToolGallery}
          aria-current={onGallery ? 'page' : undefined}
          className={cn(buttonClasses, 'font-semibold text-accent-foreground', onGallery && selectedClasses)}
        >
          <LayoutGrid className="size-5" />
          Ferramentas
        </button>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-2 py-3">
          {TOOL_GROUPS.map((group) => {
            const groupTools = toolsInGroup(group.id, tools)
            if (groupTools.length === 0) return null
            return (
              <div key={group.id}>
                <h2 className="mb-1 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</h2>
                {groupTools.map(({ id, name, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => openTool(id)}
                    aria-current={openToolId === id ? 'page' : undefined}
                    className={cn(buttonClasses, openToolId === id && selectedClasses)}
                  >
                    <Icon className="size-5" />
                    {name}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </ScrollArea>
      <VoiceStatusPanel />
      <UserPanel />
    </aside>
  )
}
