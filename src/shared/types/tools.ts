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
  /**
   * conta da pessoa, quando o nome veio da sala de voz ou da lista de online (opcional).
   * Vai para o resultado e deixa "mover os times para salas de voz" achar a pessoa certa
   * mesmo com dois nomes iguais; sem ela, a pessoa é procurada pelo nome (ou `nome#tag`).
   */
  accountId?: string
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
  /** a conta, se veio no pedido (`TeamPlayer.accountId`) */
  accountId?: string
}

export interface Team {
  /** com lanes, na ordem de `LANES` */
  members: TeamMember[]
}

export interface TeamsResult {
  teams: Team[]
  lanes: boolean
}

// ---------- Mover os times para salas de voz ----------

/**
 * Leva cada time de um sorteio já postado para uma sala de voz. Só move quem já está numa sala
 * de voz da comunidade (não chamada privada) que quem pede vê. Quem pede pode mover a si mesmo;
 * os outros, só pela regra da moderação (`canModerate`: `manageMembers` e cargo acima). A pessoa
 * também precisa poder entrar na sala do time (`view` + `connect`). Quem não dá para mover é
 * pulado e aparece em `skipped`, sem cancelar os demais.
 */
export interface MoveTeamsRequest {
  /** a mensagem do sorteio (`kind: 'tool'`, `tool.tool === 'teams'`) */
  messageId: string
  /** uma sala de voz por time, na ordem dos times; `null` = esse time fica onde está */
  channelIds: (string | null)[]
}

export type MoveTeamsSkipReason = 'not-in-voice' | 'ambiguous' | 'not-allowed' | 'no-access'

export const MOVE_TEAMS_SKIP_LABELS: Record<MoveTeamsSkipReason, string> = {
  'not-in-voice': 'não está numa sala de voz',
  ambiguous: 'mais de uma pessoa com esse nome na voz',
  'not-allowed': 'você não pode mover essa pessoa',
  'no-access': 'não pode entrar na sala do time'
}

export interface MoveTeamsSkip {
  /** o nome como está no sorteio */
  name: string
  reason: MoveTeamsSkipReason
}

/** `moved` = pessoas que trocaram de sala (quem já estava na sala do time não conta nem é pulado). */
export type MoveTeamsResult = { ok: true; moved: number; skipped: MoveTeamsSkip[] } | { ok: false; error: string }

// ---------- Dado, moeda e sortear 1 nome ----------

export const DICE_MIN_SIDES = 2
export const DICE_MAX_SIDES = 100
export const DICE_MAX_COUNT = 10
export const COIN_MAX_COUNT = 10
export const PICK_MIN_OPTIONS = 2
export const PICK_MAX_OPTIONS = 50
export const PICK_OPTION_MAX = 100

export interface DiceRequest {
  channelId: string
  /** lados de cada dado (2–100; 6 = dado comum, 20 = d20) */
  sides: number
  /** quantos dados (1–10) */
  count: number
}

export interface DiceResult {
  sides: number
  /** um valor por dado, de 1 a `sides`, na ordem em que saíram */
  rolls: number[]
  total: number
}

export type CoinSide = 'cara' | 'coroa'

export interface CoinRequest {
  channelId: string
  /** quantas moedas (1–10) */
  count: number
}

export interface CoinResult {
  flips: CoinSide[]
}

export interface PickRequest {
  channelId: string
  /** nomes ou opções (2–50, cada uma com 1–100 caracteres, sem repetir) */
  options: string[]
}

export interface PickResult {
  /** as opções como foram sorteadas (limpas) */
  options: string[]
  picked: string
}

// ---------- Enquete ----------

export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 10
export const POLL_QUESTION_MAX = 200
export const POLL_OPTION_MAX = 80

export interface PollRequest {
  channelId: string
  question: string
  /** 2–10 opções de até 80 caracteres, sem repetir */
  options: string[]
  /** true = cada pessoa pode marcar várias opções */
  multiple?: boolean
}

/** Estado da enquete (vai na mensagem e em `poll:updated`). Votos são anônimos: só as contagens. */
export interface PollResult {
  question: string
  options: string[]
  multiple: boolean
  /** votos por opção, na ordem de `options` */
  counts: number[]
  /** quantas pessoas votaram */
  voters: number
  closed: boolean
}

export type PollVoteResult = { ok: true; result: PollResult; mine: number[] } | { ok: false; error: string }
export type PollCloseResult = { ok: true; result: PollResult } | { ok: false; error: string }

/** O que vai na mensagem `kind: 'tool'`. Ferramenta nova = um tipo novo nesta união. */
export type ToolPayload =
  | { tool: 'teams'; result: TeamsResult }
  | { tool: 'dice'; result: DiceResult }
  | { tool: 'coin'; result: CoinResult }
  | { tool: 'pick'; result: PickResult }
  | { tool: 'poll'; result: PollResult }
export type ToolName = ToolPayload['tool']

export type ToolResult = { ok: true; message: Message } | { ok: false; error: string }

// ---------- Eventos ----------

export interface ToolsClientEvents {
  /** sorteia os times e posta o resultado no canal (`message:new` para quem vê o canal) */
  'tools:teams': (req: TeamsRequest, ack: (res: ToolResult) => void) => void
  /** rola `count` dados de `sides` lados */
  'tools:dice': (req: DiceRequest, ack: (res: ToolResult) => void) => void
  /** joga `count` moedas */
  'tools:coin': (req: CoinRequest, ack: (res: ToolResult) => void) => void
  /** sorteia 1 entre as opções */
  'tools:pick': (req: PickRequest, ack: (res: ToolResult) => void) => void
  /** leva os times de um sorteio já postado para salas de voz (uma por time) */
  'tools:move-teams': (req: MoveTeamsRequest, ack: (res: MoveTeamsResult) => void) => void
  /** cria uma enquete no canal */
  'tools:poll': (req: PollRequest, ack: (res: ToolResult) => void) => void
  /** substitui o meu voto (índices das opções; [] tira o voto). Voto único: no máximo 1 índice. */
  'poll:vote': (req: { messageId: string; choices: number[] }, ack: (res: PollVoteResult) => void) => void
  /** encerra a enquete (quem criou ou quem tem `manageMessages`) */
  'poll:close': (messageId: string, ack: (res: PollCloseResult) => void) => void
  /** os meus votos nessas enquetes (para marcar as opções depois de recarregar o histórico) */
  'poll:mine': (messageIds: string[], ack: (votes: Record<string, number[]>) => void) => void
}

export interface ToolsServerEvents {
  /** só para a conexão movida: entre nesta sala (o app troca de sala pelo `voice:join` de sempre) */
  'tools:moved': (payload: { channelId: string; by: string }) => void
  /** votos ou encerramento mudaram (para quem vê o canal) */
  'poll:updated': (payload: { messageId: string; channelId: string; result: PollResult }) => void
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

const fitMessage = (text: string): string => (text.length <= MESSAGE_MAX_LENGTH ? text : text.slice(0, MESSAGE_MAX_LENGTH - 1) + '…')

/** "🎲 2d6: 3 + 5 = 8" (um dado só: "🎲 d20: 17") */
export function diceResultText(result: DiceResult): string {
  const label = `${result.rolls.length > 1 ? result.rolls.length : ''}d${result.sides}`
  const detail = result.rolls.length > 1 ? `${result.rolls.join(' + ')} = ${result.total}` : String(result.total)
  return `🎲 ${label}: ${detail}`
}

/** "🪙 Cara" ou "🪙 Cara, coroa, cara (2 caras, 1 coroa)" */
export function coinResultText(result: CoinResult): string {
  const names = result.flips.map((f, i) => (i === 0 ? f[0].toUpperCase() + f.slice(1) : f)).join(', ')
  if (result.flips.length === 1) return `🪙 ${names}`
  const heads = result.flips.filter((f) => f === 'cara').length
  const tails = result.flips.length - heads
  const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`
  return `🪙 ${names} (${count(heads, 'cara')}, ${count(tails, 'coroa')})`
}

/** "🎯 Sorteado: Ana (entre 4 opções)" */
export function pickResultText(result: PickResult): string {
  return fitMessage(`🎯 Sorteado: ${result.picked} (entre ${result.options.length} opções)`)
}

/** O texto por extenso de qualquer ferramenta (vai no `content` da mensagem). */
export function toolResultText(payload: ToolPayload): string {
  switch (payload.tool) {
    case 'teams':
      return teamsResultText(payload.result)
    case 'dice':
      return diceResultText(payload.result)
    case 'coin':
      return coinResultText(payload.result)
    case 'pick':
      return pickResultText(payload.result)
    case 'poll':
      return pollResultText(payload.result)
  }
}

/** "📊 Enquete: Qual mapa? — Dust 2: 3, Mirage: 1 (4 pessoas)" + "(encerrada)" quando fechou */
export function pollResultText(result: PollResult): string {
  const options = result.options.map((o, i) => `${o}: ${result.counts[i] ?? 0}`).join(', ')
  const people = `${result.voters} ${result.voters === 1 ? 'pessoa' : 'pessoas'}`
  return fitMessage(`📊 Enquete${result.closed ? ' (encerrada)' : ''}: ${result.question} — ${options} (${people})`)
}
