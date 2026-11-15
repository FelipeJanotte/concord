/**
 * Enquetes (v4): votar, encerrar e consultar os meus votos. Criar é `tools:poll` (modules/tools.ts).
 *
 * - Votar exige ver o canal e poder enviar nele (`send`); a enquete precisa estar aberta.
 * - Votos são anônimos: todos recebem só as contagens (`poll:updated`); cada um sabe os seus (`mine`, `poll:mine`).
 * - Encerrar: quem criou ou quem tem `manageMessages`.
 */
import type { PollCloseResult, PollVoteResult } from '../../src/shared/types'
import { allowed, emitToViewers } from '../access'
import { guard, type AppServer, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { channelsOfMessages, closePoll, findPoll, setVote, votesOf, type PollMessage } from '../repo/polls'
import { validateChoices } from '../tools/poll'

/** Quantas enquetes cabem num `poll:mine` (uma página de histórico tem até 100 mensagens). */
const MINE_MAX = 100

const NOT_FOUND = 'Enquete não encontrada'

/** A enquete, se existe e a conta vê o canal dela (senão: igual a inexistente). */
async function visiblePoll(accountId: string, messageId: unknown): Promise<PollMessage | undefined> {
  if (typeof messageId !== 'string') return undefined
  const poll = await findPoll(messageId)
  return poll && (await allowed(accountId, 'view', poll.channelId)) ? poll : undefined
}

function broadcast(io: AppServer, poll: PollMessage, result: PollMessage['result']): Promise<void> {
  return emitToViewers(io, poll.channelId, 'poll:updated', { messageId: poll.messageId, channelId: poll.channelId, result })
}

export const pollsModule: ServerModule = {
  socket(io, socket) {
    socket.on('poll:vote', (req, ack) => {
      if (typeof ack !== 'function') return
      void guard('poll:vote', async (): Promise<void> => {
        const fail = (error: string): void => ack({ ok: false, error } satisfies PollVoteResult)
        const user = socket.data.user
        if (!user) return fail('Não autenticado')
        const poll = await visiblePoll(user.accountId, req?.messageId)
        if (!poll) return fail(NOT_FOUND)
        if (!(await allowed(user.accountId, 'send', poll.channelId))) return fail('Você não pode votar neste canal')
        if (poll.result.closed) return fail('Esta enquete já foi encerrada')
        const choices = validateChoices(poll.result, req?.choices)
        if (typeof choices === 'string') return fail(choices)
        const limited = limiters.vote.take(user.accountId)
        if (!limited.ok) return fail(`Muitos votos seguidos. ${retryText(limited.retryAfterMs)}`)

        const result = await setVote(poll.messageId, user.accountId, choices)
        if (!result) return fail(NOT_FOUND)
        await broadcast(io, poll, result)
        ack({ ok: true, result, mine: choices })
      })
    })

    socket.on('poll:close', (messageId, ack) => {
      if (typeof ack !== 'function') return
      void guard('poll:close', async (): Promise<void> => {
        const fail = (error: string): void => ack({ ok: false, error } satisfies PollCloseResult)
        const user = socket.data.user
        if (!user) return fail('Não autenticado')
        const poll = await visiblePoll(user.accountId, messageId)
        if (!poll) return fail(NOT_FOUND)
        const mine = poll.authorId === user.accountId
        if (!mine && !(await allowed(user.accountId, 'manageMessages'))) return fail('Só quem criou a enquete pode encerrá-la')
        if (poll.result.closed) return fail('Esta enquete já foi encerrada')

        const result = await closePoll(poll.messageId)
        if (!result) return fail(NOT_FOUND)
        await broadcast(io, poll, result)
        ack({ ok: true, result })
      })
    })

    socket.on('poll:mine', (messageIds, ack) => {
      if (typeof ack !== 'function') return
      void guard('poll:mine', async () => {
        const user = socket.data.user
        if (!user || !Array.isArray(messageIds)) return ack({})
        const ids = [...new Set(messageIds.filter((id): id is string => typeof id === 'string'))].slice(0, MINE_MAX)
        // só as enquetes de canais que a conta vê (não revela nada de canal privado)
        const channels = await channelsOfMessages(ids)
        const visible: string[] = []
        for (const [id, channelId] of channels) if (await allowed(user.accountId, 'view', channelId)) visible.push(id)
        ack(await votesOf(user.accountId, visible))
      })
    })
  }
}
