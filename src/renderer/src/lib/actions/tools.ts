// Ferramentas do grupo (v4): pede o sorteio ao servidor. O resultado chega para todos pelo `message:new`
// (mensagem `kind: 'tool'`); a resposta daqui serve para o painel fechar ou mostrar o erro.
import {
  LANES,
  pollResultText,
  type Lane,
  type Message,
  type MoveTeamsSkip,
  type PollResult,
  type TeamPlayer,
  type ToolResult
} from '@shared/types'
import { get, getSocket, notify, requireSocket, set, type AppSocket } from '../core'
import { joinVoice } from './voice'

export interface DrawTeamsOptions {
  channelId: string
  /**
   * nomes digitados ou importados (sala de voz, online); vazios e espaços extras são limpos aqui.
   * Quem veio da sala de voz ou da lista de online vai com `accountId` (para "mover os times" achar a pessoa).
   */
  players: TeamPlayer[]
  teamCount: number
  lanes?: boolean
  /** lanes disponíveis (só com `lanes`; ausente ou todas = não manda) */
  laneSet?: Lane[]
}

/** Sorteia no servidor e posta no canal. Lança `Error` com a mensagem do servidor. */
export async function drawTeams({ channelId, players, teamCount, lanes = false, laneSet }: DrawTeamsOptions): Promise<Message> {
  const subset = lanes && laneSet && laneSet.length < LANES.length ? { laneSet } : {}
  const clean = players
    .map((p) => ({ ...p, name: p.name.replace(/\s+/g, ' ').trim() }))
    .filter((p) => p.name)
    .map((p) => ({
      name: p.name,
      ...(lanes && p.lanes?.length ? { lanes: p.lanes } : {}),
      ...(p.accountId ? { accountId: p.accountId } : {})
    }))
  const res = await requireSocket().emitWithAck('tools:teams', { channelId, players: clean, teamCount, lanes, ...subset })
  if (!res.ok) throw new Error(res.error)
  return res.message
}

function unwrap(res: ToolResult): Message {
  if (!res.ok) throw new Error(res.error)
  return res.message
}

/** Rola `count` dados de `sides` lados (ex.: 1 d20, 2 d6) e posta no canal. */
export async function rollDice(channelId: string, sides: number, count = 1): Promise<Message> {
  return unwrap(await requireSocket().emitWithAck('tools:dice', { channelId, sides, count }))
}

/** Joga `count` moedas e posta no canal. */
export async function flipCoin(channelId: string, count = 1): Promise<Message> {
  return unwrap(await requireSocket().emitWithAck('tools:coin', { channelId, count }))
}

/**
 * Sorteia 1 entre as opções e posta no canal. Aceita a lista pronta ou o texto do campo
 * (uma opção por linha); linhas vazias são ignoradas pelo servidor.
 */
export async function pickOne(channelId: string, options: string[] | string): Promise<Message> {
  const list = typeof options === 'string' ? options.split(/\r?\n/) : options
  return unwrap(await requireSocket().emitWithAck('tools:pick', { channelId, options: list }))
}

// ---------- Enquete ----------

/** Troca o estado da enquete na mensagem já carregada (o `content` acompanha, para o texto por extenso). */
function applyPoll(channelId: string, messageId: string, result: PollResult): void {
  set((st) => {
    const list = st.messages[channelId]
    if (!list?.some((m) => m.id === messageId)) return {}
    return {
      messages: {
        ...st.messages,
        [channelId]: list.map((m) =>
          m.id === messageId ? { ...m, tool: { tool: 'poll' as const, result }, content: pollResultText(result) } : m
        )
      }
    }
  })
}

export function bindToolsEvents(s: AppSocket): void {
  // votos ou encerramento mudaram (já filtrado para quem vê o canal)
  s.on('poll:updated', ({ messageId, channelId, result }) => applyPoll(channelId, messageId, result))

  // alguém levou os times para as salas de voz: troca de sala (só se ainda estou na voz)
  s.on('tools:moved', ({ channelId, by }) => {
    const { myVoiceChannelId } = get()
    if (!myVoiceChannelId || myVoiceChannelId === channelId) return
    notify(`${by} levou você para a sala do seu time.`, 'info')
    void joinVoice(channelId)
  })
}

// ---------- Mover os times para salas de voz ----------

/**
 * Leva cada time do sorteio `messageId` para uma sala de voz (`channelIds[i]` = sala do time i;
 * `null` = esse time fica onde está). Devolve quantas pessoas trocaram de sala e quem foi pulado
 * (com o motivo, para a tela mostrar com `MOVE_TEAMS_SKIP_LABELS`). Lança `Error` com a mensagem do servidor.
 */
export async function moveTeams(messageId: string, channelIds: (string | null)[]): Promise<{ moved: number; skipped: MoveTeamsSkip[] }> {
  const res = await requireSocket().emitWithAck('tools:move-teams', { messageId, channelIds })
  if (!res.ok) throw new Error(res.error)
  return { moved: res.moved, skipped: res.skipped }
}

/** Cria uma enquete no canal. Opções vazias são ignoradas pelo servidor. */
export async function createPoll(channelId: string, question: string, options: string[], multiple = false): Promise<Message> {
  return unwrap(await requireSocket().emitWithAck('tools:poll', { channelId, question, options, multiple }))
}

/** Vota (substitui o voto anterior; `[]` tira o voto). Atualiza a mensagem e os meus votos na hora. */
export async function votePoll(channelId: string, messageId: string, choices: number[]): Promise<void> {
  const res = await requireSocket().emitWithAck('poll:vote', { messageId, choices })
  if (!res.ok) throw new Error(res.error)
  applyPoll(channelId, messageId, res.result)
  set((st) => ({ myPollVotes: { ...st.myPollVotes, [messageId]: res.mine } }))
}

/** Encerra a enquete (quem criou ou quem tem `manageMessages`). */
export async function closePoll(channelId: string, messageId: string): Promise<void> {
  const res = await requireSocket().emitWithAck('poll:close', messageId)
  if (!res.ok) throw new Error(res.error)
  applyPoll(channelId, messageId, res.result)
}

/** Carrega os meus votos nas enquetes das mensagens (ex.: as do histórico que acabou de abrir). */
export async function loadMyPollVotes(messages: Message[]): Promise<void> {
  const s = getSocket()
  const ids = messages.filter((m) => m.tool?.tool === 'poll').map((m) => m.id)
  if (!s || ids.length === 0) return
  const votes = await s.emitWithAck('poll:mine', ids)
  set((st) => {
    const next = { ...st.myPollVotes }
    for (const id of ids) next[id] = votes[id] ?? []
    return { myPollVotes: next }
  })
}
