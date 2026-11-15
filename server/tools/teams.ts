/**
 * Sorteador de times (v4, A8): validação e sorteio, funções puras. O acaso vem de `rand(max)`
 * (inteiro em [0, max)); o servidor passa `crypto.randomInt`, os testes passam um gerador previsível.
 *
 * - Embaralha (Fisher–Yates) e distribui em rodízio: os tamanhos dos times diferem em no máximo 1.
 * - Com lanes: cada pessoa do time recebe uma lane diferente, entre as disponíveis (`laneSet`; todas
 *   por padrão), então cada time tem no máximo `laneSet.length` pessoas. Quem tem preferência
 *   tenta ficar com ela (a 1ª vale mais que a 2ª...). Para isso o sorteio é repetido algumas vezes
 *   e fica o que atende melhor as preferências; dentro do time, testa todas as combinações de lanes.
 */
import {
  LANES,
  TEAM_LANES_MAX_SIZE,
  TEAM_PLAYER_NAME_MAX,
  TEAMS_MAX,
  TEAMS_MAX_PLAYERS,
  TEAMS_MIN,
  TEAMS_MIN_PLAYERS,
  type Lane,
  type Team,
  type TeamMember,
  type TeamPlayer,
  type TeamsResult
} from '../../src/shared/types'

export type Rand = (max: number) => number

/** tamanho máximo do `accountId` aceito (é um uuid; mais que isso é lixo) */
const ACCOUNT_ID_MAX = 64

export interface CleanTeamsInput {
  players: Array<{ name: string; lanes: Lane[]; accountId?: string }>
  teamCount: number
  lanes: boolean
  /** lanes que valem neste sorteio, na ordem de `LANES` (todas, se o pedido não escolheu) */
  laneSet: Lane[]
}

const isLane = (l: unknown): l is Lane => (LANES as readonly unknown[]).includes(l)

/** Confere tudo que veio do app. Devolve a entrada limpa ou a mensagem de erro (pt-BR). */
export function validateTeams(raw: unknown): CleanTeamsInput | string {
  const req = raw as { players?: unknown; teamCount?: unknown; lanes?: unknown; laneSet?: unknown } | null
  if (!req || typeof req !== 'object' || !Array.isArray(req.players)) return 'Lista de pessoas inválida'
  if (req.players.length < TEAMS_MIN_PLAYERS) return `Coloque pelo menos ${TEAMS_MIN_PLAYERS} pessoas`
  if (req.players.length > TEAMS_MAX_PLAYERS) return `No máximo ${TEAMS_MAX_PLAYERS} pessoas`
  const lanes = req.lanes === true

  // lanes disponíveis: só valem com `lanes`; ausente = todas
  let laneSet: Lane[] = [...LANES]
  if (lanes && req.laneSet !== undefined) {
    const chosen = req.laneSet
    if (!Array.isArray(chosen) || !chosen.every(isLane) || new Set(chosen).size !== chosen.length) return 'Lanes disponíveis inválidas'
    if (chosen.length === 0) return 'Escolha pelo menos uma lane'
    laneSet = LANES.filter((l) => chosen.includes(l))
  }

  const players: CleanTeamsInput['players'] = []
  const seen = new Set<string>()
  const accounts = new Set<string>()
  for (const p of req.players as unknown[]) {
    const player = p as Partial<TeamPlayer> | null
    const name = typeof player?.name === 'string' ? player.name.replace(/\s+/g, ' ').trim() : ''
    if (!name || name.length > TEAM_PLAYER_NAME_MAX) return `Cada nome precisa ter de 1 a ${TEAM_PLAYER_NAME_MAX} caracteres`
    const key = name.toLocaleLowerCase('pt-BR')
    if (seen.has(key)) return `Nome repetido: ${name}`
    seen.add(key)
    const prefs = player?.lanes ?? []
    if (!Array.isArray(prefs) || !prefs.every(isLane) || new Set(prefs).size !== prefs.length) {
      return `Lanes inválidas para ${name}`
    }
    const accountId = player?.accountId
    if (accountId !== undefined) {
      if (typeof accountId !== 'string' || !accountId || accountId.length > ACCOUNT_ID_MAX) return `Conta inválida para ${name}`
      if (accounts.has(accountId)) return `Pessoa repetida: ${name}`
      accounts.add(accountId)
    }
    // preferência por lane fora das disponíveis é ignorada (não dá para atender)
    const kept = lanes ? (prefs as Lane[]).filter((l) => laneSet.includes(l)) : []
    players.push({ name, lanes: kept, ...(accountId ? { accountId } : {}) })
  }

  const teamCount = req.teamCount
  if (typeof teamCount !== 'number' || !Number.isInteger(teamCount) || teamCount < TEAMS_MIN || teamCount > TEAMS_MAX) {
    return `O número de times vai de ${TEAMS_MIN} a ${TEAMS_MAX}`
  }
  if (teamCount > players.length) return 'Mais times do que pessoas'
  if (lanes && players.length > teamCount * laneSet.length) {
    const max = laneSet.length
    return `Com ${max} ${max === 1 ? 'lane' : 'lanes'}, cada time pode ter no máximo ${max} ${max === 1 ? 'pessoa' : 'pessoas'}: aumente o número de times ou as lanes`
  }
  return { players, teamCount, lanes, laneSet }
}

/** Fisher–Yates (cópia). */
export function shuffle<T>(items: readonly T[], rand: Rand): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Pontos de uma pessoa numa lane: 1ª preferência = 5, 2ª = 4...; fora da lista (ou sem lista) = 0. */
const laneScore = (prefs: Lane[], lane: Lane): number => {
  const i = prefs.indexOf(lane)
  return i < 0 ? 0 : TEAM_LANES_MAX_SIZE - i
}

/** Todas as formas de dar lanes diferentes (de `available`) para `k` pessoas (no máximo 5·4·3·2·1 = 120). */
function laneArrangements(k: number, available: readonly Lane[]): Lane[][] {
  const out: Lane[][] = []
  const walk = (acc: Lane[]): void => {
    if (acc.length === k) return void out.push(acc)
    for (const lane of available) if (!acc.includes(lane)) walk([...acc, lane])
  }
  walk([])
  return out
}

/** Melhor distribuição de lanes num time (empates: sorteio). */
function assignLanes(members: CleanTeamsInput['players'], available: readonly Lane[], rand: Rand): { lanes: Lane[]; score: number } {
  let best: Lane[][] = []
  let bestScore = -1
  for (const option of laneArrangements(members.length, available)) {
    const score = option.reduce((sum, lane, i) => sum + laneScore(members[i].lanes, lane), 0)
    if (score > bestScore) {
      bestScore = score
      best = [option]
    } else if (score === bestScore) best.push(option)
  }
  return { lanes: best[rand(best.length)], score: bestScore }
}

/** Quantas vezes o sorteio é repetido quando há preferências de lane (fica o que atende melhor). */
export const LANE_ATTEMPTS = 40

/** O que vai para o resultado: o nome e, se veio, a conta. */
const member = (p: CleanTeamsInput['players'][number]): TeamMember =>
  p.accountId ? { name: p.name, accountId: p.accountId } : { name: p.name }

function drawOnce(input: CleanTeamsInput, rand: Rand): { teams: Team[]; score: number } {
  const order = shuffle(input.players, rand)
  const groups: CleanTeamsInput['players'][] = Array.from({ length: input.teamCount }, () => [])
  order.forEach((p, i) => groups[i % input.teamCount].push(p))
  // quem fica com uma pessoa a mais também é sorteado (senão o time 1 seria sempre o maior)
  const teamsOrder = shuffle(groups, rand)

  let score = 0
  const teams = teamsOrder.map((members): Team => {
    if (!input.lanes) return { members: members.map(member) }
    const assigned = assignLanes(members, input.laneSet, rand)
    score += assigned.score
    const withLanes = members.map((p, i) => ({ ...member(p), lane: assigned.lanes[i] }))
    withLanes.sort((a, b) => LANES.indexOf(a.lane) - LANES.indexOf(b.lane))
    return { members: withLanes }
  })
  return { teams, score }
}

/** Sorteia os times. `input` já validado por `validateTeams`. */
export function drawTeams(input: CleanTeamsInput, rand: Rand): TeamsResult {
  const hasPrefs = input.lanes && input.players.some((p) => p.lanes.length > 0)
  let best = drawOnce(input, rand)
  for (let i = 1; hasPrefs && i < LANE_ATTEMPTS; i++) {
    const next = drawOnce(input, rand)
    if (next.score > best.score) best = next
  }
  return input.lanes && input.laneSet.length < LANES.length
    ? { teams: best.teams, lanes: true, laneSet: input.laneSet }
    : { teams: best.teams, lanes: input.lanes }
}
