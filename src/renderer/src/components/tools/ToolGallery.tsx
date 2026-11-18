import { openTool } from '@/lib/client'
import { TOOL_GROUPS, toolsInGroup, TOOLS, type ToolDefinition } from './registry'

export function ToolGallery({ tools = TOOLS }: { tools?: readonly ToolDefinition[] }) {
  return (
    <>
      <header className="flex h-12 shrink-0 items-center border-b border-black/25 px-4 shadow-sm">
        <h1 className="font-semibold text-accent-foreground">Ferramentas</h1>
      </header>
      <div role="region" aria-label="Galeria de ferramentas" className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        {TOOL_GROUPS.map((group) => {
          const groupTools = toolsInGroup(group.id, tools)
          if (groupTools.length === 0) return null
          return (
            <section key={group.id}>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
                {groupTools.map(({ id, name, description, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => openTool(id)}
                    className="flex flex-col items-start gap-2 rounded-lg bg-panel p-4 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="size-6 text-accent-foreground" />
                    <span className="font-semibold text-accent-foreground">{name}</span>
                    <span className="text-sm text-muted-foreground">{description}</span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}
