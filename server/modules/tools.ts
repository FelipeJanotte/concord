/**
 * Ferramentas do grupo (v4): sorteador de times (A8), dado, moeda e sortear 1 nome.
 *
 * O sorteio roda aqui, com `crypto.randomInt`, e o resultado vira uma mensagem `kind: 'tool'`
 * no canal: todos que veem o canal recebem o mesmo resultado pelo `message:new` de sempre.
 * Ferramenta nova: um tipo em `ToolPayload` + um evento `tools:<nome>` registrado em `TOOLS`
 * + as funções puras (validar e sortear) em `server/tools/`.
 */
import { randomInt, randomUUID } from 'node:crypto'
import { toolResultText, type ClientToServerEvents, type Message, type ToolPayload, type ToolResult } from '../../src/shared/types'
import { allowed, emitToViewers } from '../access'
import { guard, type AppServer, type AppSocket, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { findChannel } from '../repo/channels'
import { insertMessage } from '../repo/messages'
import { flipCoins, pickOne, rollDice, validateCoin, validateDice, validatePick } from '../tools/random'
import { drawTeams, validateTeams, type Rand } from '../tools/teams'

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

export const toolsModule: ServerModule = {
  socket(io, socket) {
    for (const [event, tool] of Object.entries(TOOLS) as [keyof typeof TOOLS, Tool][]) {
      ;(socket.on as (ev: string, fn: (req: unknown, ack: unknown) => void) => void)(event, (req, ack) => {
        if (typeof ack !== 'function') return
        void guard(event, async () => (ack as (res: ToolResult) => void)(await runTool(io, socket, tool, req)))
      })
    }
  }
}
