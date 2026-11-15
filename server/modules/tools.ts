/**
 * Ferramentas do grupo (v4): sorteador de times (A8), dado, moeda, sortear 1 nome e criar enquete
 * (votar e encerrar ficam em `modules/polls.ts`).
 *
 * O sorteio roda aqui, com `crypto.randomInt`, e o resultado vira uma mensagem `kind: 'tool'`
 * no canal: todos que veem o canal recebem o mesmo resultado pelo `message:new` de sempre.
 * Ferramenta nova: um tipo em `ToolPayload` + um evento `tools:<nome>` registrado em `TOOLS`
 * + as funções puras (validar e sortear) em `server/tools/`.
 */
import { randomInt, randomUUID } from 'node:crypto'
import {
  canModerate,
  toolResultText,
  type ClientToServerEvents,
  type Message,
  type MoveTeamsResult,
  type MoveTeamsSkip,
  type ToolPayload,
  type ToolResult
} from '../../src/shared/types'
import { allowed, currentAccess, dmMembersOf, emitToViewers } from '../access'
import { guard, type AppServer, type AppSocket, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { findChannel } from '../repo/channels'
import { findToolMessage, insertMessage } from '../repo/messages'
import { planMoves, validateMoveRequest, type VoicePerson } from '../tools/move'
import { newPoll, validatePoll } from '../tools/poll'
import { flipCoins, pickOne, rollDice, validateCoin, validateDice, validatePick } from '../tools/random'
import { drawTeams, validateTeams, type Rand } from '../tools/teams'
import { voiceStates } from './voice'

const fail = (error: string): ToolResult => ({ ok: false, error })

/** Uma ferramenta: valida o pedido (texto = erro) e sorteia com o acaso dado. */
interface Tool {
  run(req: unknown, rand: Rand): ToolPayload | string
}

const TOOLS = {
  'tools:teams': {
    run(req, rand) {
      const input = validateTeams(req)
      return typeof input === 'string' ? input : { tool: 'teams', result: drawTeams(input, rand) }
    }
  },
  'tools:dice': {
    run(req, rand) {
      const input = validateDice(req)
      return typeof input === 'string' ? input : { tool: 'dice', result: rollDice(input, rand) }
    }
  },
  'tools:coin': {
    run(req, rand) {
      const input = validateCoin(req)
      return typeof input === 'string' ? input : { tool: 'coin', result: flipCoins(input, rand) }
    }
  },
  'tools:pick': {
    run(req, rand) {
      const input = validatePick(req)
      return typeof input === 'string' ? input : { tool: 'pick', result: pickOne(input, rand) }
    }
  },
  'tools:poll': {
    // não sorteia nada: a enquete começa sem votos (votar e encerrar em modules/polls.ts)
    run(req) {
      const input = validatePoll(req)
      return typeof input === 'string' ? input : { tool: 'poll', result: newPoll(input) }
    }
  }
} satisfies Partial<Record<keyof ClientToServerEvents, Tool>>

/** Confere o canal e a permissão, roda a ferramenta e posta o resultado no canal. */
async function runTool(io: AppServer, socket: AppSocket, tool: Tool, req: unknown): Promise<ToolResult> {
  const user = socket.data.user
  if (!user) return fail('Não autenticado')
  const channelId = typeof (req as { channelId?: unknown } | null)?.channelId === 'string' ? (req as { channelId: string }).channelId : ''
  const channel = channelId ? await findChannel(channelId) : undefined
  // sem ver o canal: igual a canal inexistente
  if (!channel || channel.type === 'voice' || !(await allowed(user.accountId, 'view', channel.id))) return fail('Canal não encontrado')
  if (!(await allowed(user.accountId, 'send', channel.id))) return fail('Você não pode enviar mensagens neste canal')

  // valida antes de gastar o limite (erro de digitação não conta como sorteio)
  const preview = tool.run(req, () => 0)
  if (typeof preview === 'string') return fail(preview)
  const limited = limiters.tool.take(user.accountId)
  if (!limited.ok) return fail(`Muitos sorteios seguidos. ${retryText(limited.retryAfterMs)}`)

  const payload = tool.run(req, randomInt) as ToolPayload
  const message: Message = {
    id: randomUUID(),
    channelId: channel.id,
    author: { ...user },
    content: toolResultText(payload),
    attachments: [],
    createdAt: Date.now(),
    kind: 'tool',
    tool: payload
  }
  const saved = await insertMessage(message)
  if (!saved) return fail('Não foi possível postar o resultado')
  await emitToViewers(io, channel.id, 'message:new', saved)
  return { ok: true, message: saved }
}

/**
 * `tools:move-teams`: leva cada time de um sorteio já postado para a sala de voz escolhida.
 * Não move ninguém à força no LiveKit: avisa cada conexão (`tools:moved`) e o app troca de sala
 * pelo `voice:join` de sempre (que confere a permissão de novo e emite o token).
 */
async function moveTeams(io: AppServer, socket: AppSocket, raw: unknown): Promise<MoveTeamsResult> {
  const user = socket.data.user
  if (!user) return { ok: false, error: 'Não autenticado' }
  const req = validateMoveRequest(raw)
  if (typeof req === 'string') return { ok: false, error: req }

  // sem ver o canal do sorteio: como se a mensagem não existisse
  const found = await findToolMessage(req.messageId)
  if (!found || found.tool.tool !== 'teams' || !(await allowed(user.accountId, 'view', found.channelId))) {
    return { ok: false, error: 'Sorteio de times não encontrado' }
  }
  const { teams } = found.tool.result
  if (req.channelIds.length !== teams.length) return { ok: false, error: 'Escolha uma sala para cada time' }
  for (const id of req.channelIds) {
    if (id === null) continue
    const channel = await findChannel(id)
    if (!channel || channel.type !== 'voice' || !(await allowed(user.accountId, 'view', id))) {
      return { ok: false, error: 'Sala de voz não encontrada' }
    }
  }
  // pedido válido: agora gasta o limite (o mesmo da moderação)
  const limited = limiters.moderation.take(user.accountId)
  if (!limited.ok) return { ok: false, error: `Muitas ações seguidas. ${retryText(limited.retryAfterMs)}` }

  // quem está na voz, só nas salas da comunidade que eu vejo (chamada privada não entra)
  const people: VoicePerson[] = []
  for (const state of voiceStates()) {
    const target = io.sockets.sockets.get(state.userId)?.data.user
    if (!target || dmMembersOf(state.channelId) || !(await allowed(user.accountId, 'view', state.channelId))) continue
    people.push({ socketId: state.userId, accountId: target.accountId, name: target.name, tag: target.tag, channelId: state.channelId })
  }

  const plan = planMoves(teams, req.channelIds, people)
  const skipped: MoveTeamsSkip[] = [...plan.skipped]
  const access = await currentAccess()
  const roomOf = new Map(people.map((p) => [p.socketId, p.channelId]))
  let moved = 0
  for (const move of plan.moves) {
    if (move.accountId !== user.accountId && !canModerate(access, user.accountId, move.accountId)) {
      skipped.push({ name: move.name, reason: 'not-allowed' })
      continue
    }
    if (!(await allowed(move.accountId, 'view', move.channelId)) || !(await allowed(move.accountId, 'connect', move.channelId))) {
      skipped.push({ name: move.name, reason: 'no-access' })
      continue
    }
    const sockets = move.socketIds.filter((id) => roomOf.get(id) !== move.channelId)
    if (sockets.length === 0) continue // já está na sala do time
    for (const id of sockets) io.to(id).emit('tools:moved', { channelId: move.channelId, by: user.name })
    moved++
  }
  return { ok: true, moved, skipped }
}

export const toolsModule: ServerModule = {
  socket(io, socket) {
    socket.on('tools:move-teams', (req, ack) => {
      if (typeof ack !== 'function') return
      void guard('tools:move-teams', async () => ack(await moveTeams(io, socket, req)))
    })
    for (const [event, tool] of Object.entries(TOOLS) as [keyof typeof TOOLS, Tool][]) {
      ;(socket.on as (ev: string, fn: (req: unknown, ack: unknown) => void) => void)(event, (req, ack) => {
        if (typeof ack !== 'function') return
        void guard(event, async () => (ack as (res: ToolResult) => void)(await runTool(io, socket, tool, req)))
      })
    }
  }
}
