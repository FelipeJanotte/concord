/**
 * CONTRATO — v4 ferramentas do grupo (A8 servidor do sorteador; B10 painel e cartão do resultado).
 *
 * O sorteio roda NO SERVIDOR (`crypto.randomInt`) e o resultado é postado no canal como uma mensagem
 * `kind: 'tool'` (com `tool` tipado): todos veem o mesmo resultado e ninguém "rola de novo escondido".
 * A mensagem também traz `content` em texto (o resultado por extenso), para telas que ainda não
 * desenham o cartão.
 */
import { MESSAGE_MAX_LENGTH, type Message } from './message'

// ---------- Sorteador de times ----------

export const LANES = ['top', 'jungle', 'mid', 'adc', 'support'] as const
export type Lane = (typeof LANES)[number]

export const LANE_LABELS: Record<Lane, string> = {
  top: 'Topo',
  jungle: 'Selva',
  mid: 'Meio',
  adc: 'Atirador',
  support: 'Suporte'
}

export const TEAMS_MIN_PLAYERS = 2
export const TEAMS_MAX_PLAYERS = 50
export const TEAM_PLAYER_NAME_MAX = 32
export const TEAMS_MIN = 2
export const TEAMS_MAX = 10
/** com lanes, cada time tem no máximo uma pessoa por lane */
export const TEAM_LANES_MAX_SIZE = LANES.length

export interface TeamPlayer {
  name: string
  /** lanes que a pessoa prefere, da preferida para a menos (opcional; só vale com `lanes`) */
  lanes?: Lane[]
}

export interface TeamsRequest {
  /** canal (de texto ou conversa privada) onde o resultado é postado */
  channelId: string
  players: TeamPlayer[]
  teamCount: number
  /** atribuir lanes sem repetir dentro do time (times de até 5) */
  lanes?: boolean
}

export interface TeamMember {
  name: string
  lane?: Lane
}

export interface Team {
  /** com lanes, na ordem de `LANES` */
  members: TeamMember[]
}

export interface TeamsResult {
  teams: Team[]
  lanes: boolean
}

/** O que vai na mensagem `kind: 'tool'`. Ferramenta nova = um tipo novo nesta união. */
export type ToolPayload = { tool: 'teams'; result: TeamsResult }
export type ToolName = ToolPayload['tool']

export type ToolResult = { ok: true; message: Message } | { ok: false; error: string }

// ---------- Eventos ----------

export interface ToolsClientEvents {
  /** sorteia os times e posta o resultado no canal (`message:new` para quem vê o canal) */
  'tools:teams': (req: TeamsRequest, ack: (res: ToolResult) => void) => void
}

// ---------- Funções puras ----------

/**
 * O resultado por extenso (vai no `content` da mensagem; até `MESSAGE_MAX_LENGTH`):
 *   Times sorteados
 *   Time 1: Ana (Topo), Bia (Selva)
 *   Time 2: Caio, Duda
 */
export function teamsResultText(result: TeamsResult): string {
  const lines = result.teams.map(
    (team, i) => `Time ${i + 1}: ${team.members.map((m) => (m.lane ? `${m.name} (${LANE_LABELS[m.lane]})` : m.name)).join(', ')}`
  )
  const text = ['Times sorteados', ...lines].join('\n')
  return text.length <= MESSAGE_MAX_LENGTH ? text : text.slice(0, MESSAGE_MAX_LENGTH - 1) + '…'
}
