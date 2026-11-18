import type { ComponentType } from 'react'
import { BarChart3, Coins, Dices, Shuffle, Target, type LucideIcon } from 'lucide-react'
import { CoinPanel } from './CoinPanel'
import { DicePanel } from './DicePanel'
import { PickPanel } from './PickPanel'
import { PollPanel } from './PollPanel'
import { TeamRandomizerPanel } from './TeamRandomizerPanel'

export type ToolGroup = 'community' | 'fun'

export const TOOL_GROUPS: readonly { id: ToolGroup; label: string }[] = [
  { id: 'community', label: 'Comunidade' },
  { id: 'fun', label: 'Diversão' }
]

export interface ToolDefinition {
  id: string
  name: string
  description: string
  group: ToolGroup
  icon: LucideIcon
  Panel: ComponentType
}

export const TOOLS: ToolDefinition[] = [
  { id: 'teams', name: 'Sorteador de times', description: 'Divida as pessoas em times equilibrados.', group: 'community', icon: Shuffle, Panel: TeamRandomizerPanel },
  { id: 'dice', name: 'Dado', description: 'Role um ou mais dados.', group: 'fun', icon: Dices, Panel: DicePanel },
  { id: 'coin', name: 'Cara ou coroa', description: 'Jogue a moeda.', group: 'fun', icon: Coins, Panel: CoinPanel },
  { id: 'pick', name: 'Sortear 1', description: 'Escolha um nome de uma lista.', group: 'fun', icon: Target, Panel: PickPanel },
  { id: 'poll', name: 'Enquete', description: 'Pergunte e deixe o grupo votar.', group: 'community', icon: BarChart3, Panel: PollPanel }
]

export function findTool(id: string | null, tools: readonly ToolDefinition[] = TOOLS): ToolDefinition | undefined {
  return id ? tools.find((t) => t.id === id) : undefined
}

export function toolsInGroup(group: ToolGroup, tools: readonly ToolDefinition[] = TOOLS): ToolDefinition[] {
  return tools.filter((t) => t.group === group)
}
