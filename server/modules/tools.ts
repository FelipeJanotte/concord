/**
 * Ferramentas do grupo (v4). Hoje: sorteador de times (A8).
 *
 * O sorteio roda aqui, com `crypto.randomInt`, e o resultado vira uma mensagem `kind: 'tool'`
 * no canal: todos que veem o canal recebem o mesmo resultado pelo `message:new` de sempre.
 * Ferramenta nova: um evento `tools:<nome>` + a função pura em `server/tools/<nome>.ts`.
 */
import { randomInt, randomUUID } from 'node:crypto'
import { teamsResultText, type Message, type ToolResult } from '../../src/shared/types'
import { allowed, emitToViewers } from '../access'
import { guard, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { findChannel } from '../repo/channels'
import { insertMessage } from '../repo/messages'
import { drawTeams, validateTeams } from '../tools/teams'

const fail = (error: string): ToolResult => ({ ok: false, error })

export const toolsModule: ServerModule = {
  socket(io, socket) {
    socket.on('tools:teams', (req, ack) => {
      if (typeof ack !== 'function') return
      void guard('tools:teams', async () => {
        const user = socket.data.user
        if (!user) return ack(fail('Não autenticado'))
        const channelId = typeof req?.channelId === 'string' ? req.channelId : ''
        const channel = channelId ? await findChannel(channelId) : undefined
        // sem ver o canal: igual a canal inexistente
        if (!channel || channel.type === 'voice' || !(await allowed(user.accountId, 'view', channel.id))) {
          return ack(fail('Canal não encontrado'))
        }
        if (!(await allowed(user.accountId, 'send', channel.id))) return ack(fail('Você não pode enviar mensagens neste canal'))

        const input = validateTeams(req)
        if (typeof input === 'string') return ack(fail(input))
        const limited = limiters.tool.take(user.accountId)
        if (!limited.ok) return ack(fail(`Muitos sorteios seguidos. ${retryText(limited.retryAfterMs)}`))

        const result = drawTeams(input, randomInt)
        const message: Message = {
          id: randomUUID(),
          channelId: channel.id,
          author: { ...user },
          content: teamsResultText(result),
          attachments: [],
          createdAt: Date.now(),
          kind: 'tool',
          tool: { tool: 'teams', result }
        }
        const saved = await insertMessage(message)
        if (!saved) return ack(fail('Não foi possível postar o resultado'))
        await emitToViewers(io, channel.id, 'message:new', saved)
        ack({ ok: true, message: saved })
      })
    })
  }
}
