// Área central de uma ferramenta da barra de úteis (B7): cabeçalho + o painel do registro.
import { Wrench } from 'lucide-react'
import { useApp } from '@/store'
import { findTool, TOOLS, type ToolDefinition } from './registry'

export function ToolView({ tools = TOOLS }: { tools?: readonly ToolDefinition[] }) {
  const tool = useApp((s) => findTool(s.toolId, tools))
  if (!tool) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Wrench className="size-12" />
        <p>Ferramenta não encontrada.</p>
      </div>
    )
  }
  const { Panel, icon: Icon } = tool
  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/25 px-4 shadow-sm">
        <Icon className="size-5 text-muted-foreground" />
        <h1 className="font-semibold text-accent-foreground">{tool.name}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Panel />
      </div>
    </>
  )
}
