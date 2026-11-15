/**
 * Registro das ferramentas do grupo (v4) que aparecem na barra de úteis, abaixo do separador.
 * Cada ferramenta = id, nome (tooltip), ícone e o painel que abre na área central
 * (`section: 'tool'`; o canal ou a sala atual continuam como contexto).
 *
 * Ferramenta nova (B10 e seguintes): crie o painel em `components/tools/` e acrescente UMA linha em `TOOLS`.
 */
import type { ComponentType } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface ToolDefinition {
  /** id estável (vai para `toolId` na store) */
  id: string
  /** nome no tooltip e no cabeçalho do painel */
  name: string
  icon: LucideIcon
  /** painel da área central */
  Panel: ComponentType
}

export const TOOLS: ToolDefinition[] = []

export function findTool(id: string | null, tools: readonly ToolDefinition[] = TOOLS): ToolDefinition | undefined {
  return id ? tools.find((t) => t.id === id) : undefined
}
