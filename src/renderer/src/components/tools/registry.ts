/**
 * Registro das ferramentas do grupo (v4) que aparecem na barra de úteis, abaixo do separador.
 * Cada ferramenta = id, nome (tooltip), ícone e o painel que abre na área central
 * (`section: 'tool'`; o canal ou a sala atual continuam como contexto).
 *
 * Ferramenta nova (B10 e seguintes): crie o painel em `components/tools/` e acrescente UMA linha em `TOOLS`.
 */
import type { ComponentType } from 'react'
import { BarChart3, Coins, Dices, Shuffle, Target, type LucideIcon } from 'lucide-react'
import { CoinPanel } from './CoinPanel'
import { DicePanel } from './DicePanel'
import { PickPanel } from './PickPanel'
import { PollPanel } from './PollPanel'
import { TeamRandomizerPanel } from './TeamRandomizerPanel'

export interface ToolDefinition {
  /** id estável (vai para `toolId` na store) */
  id: string
  /** nome no tooltip e no cabeçalho do painel */
  name: string
  icon: LucideIcon
  /** painel da área central */
  Panel: ComponentType
}

export const TOOLS: ToolDefinition[] = [
  { id: 'teams', name: 'Sorteador de times', icon: Shuffle, Panel: TeamRandomizerPanel },
  { id: 'dice', name: 'Dado', icon: Dices, Panel: DicePanel },
  { id: 'coin', name: 'Cara ou coroa', icon: Coins, Panel: CoinPanel },
  { id: 'pick', name: 'Sortear 1', icon: Target, Panel: PickPanel },
  { id: 'poll', name: 'Enquete', icon: BarChart3, Panel: PollPanel }
]

export function findTool(id: string | null, tools: readonly ToolDefinition[] = TOOLS): ToolDefinition | undefined {
  return id ? tools.find((t) => t.id === id) : undefined
}
