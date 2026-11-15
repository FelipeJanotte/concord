/**
 * Reações em mensagens (v6, A16): `message:react` liga/tira a minha reação e manda a lista inteira
 * da mensagem (`message:reactions`) para quem vê o canal. Reagir exige ver o canal e poder mandar
 * mensagem nele. Skill `concord-messages`.
 */
import { cleanReactionEmoji, REACTIONS_PER_MESSAGE_MAX } from '../../src/shared/types'
import { allowed, emitToViewers } from '../access'
import { guard, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { findMessageMeta } from '../repo/messages'
import { setReaction } from '../repo/reactions'

export const reactionsModule: ServerModule = {
  socket(io, socket) {
    socket.on('message:react', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('message:react', async () => {
        const user = socket.data.user
        if (!user) return ack({ ok: false, error: 'Não autenticado' })
        const emoji = cleanReactionEmoji(payload?.emoji)
        if (typeof payload?.messageId !== 'string' || typeof payload.on !== 'boolean' || !emoji) {
          return ack({ ok: false, error: 'Reação inválida' })
        }
        const meta = await findMessageMeta(payload.messageId)
        // sem ver o canal: igual a mensagem inexistente
        if (!meta || !(await allowed(user.accountId, 'view', meta.channelId))) return ack({ ok: false, error: 'Mensagem não encontrada' })
        if (!(await allowed(user.accountId, 'send', meta.channelId))) return ack({ ok: false, error: 'Você não pode reagir neste canal' })
        const limited = limiters.reaction.take(user.accountId)
        if (!limited.ok) return ack({ ok: false, error: `Muitas reações seguidas. ${retryText(limited.retryAfterMs)}` })
        const reactions = await setReaction(payload.messageId, user.accountId, emoji, payload.on)
        if (reactions === 'limit') return ack({ ok: false, error: `Esta mensagem já tem ${REACTIONS_PER_MESSAGE_MAX} reações diferentes` })
        await emitToViewers(io, meta.channelId, 'message:reactions', { channelId: meta.channelId, messageId: payload.messageId, reactions })
        ack({ ok: true })
      })
    })
  }
}
