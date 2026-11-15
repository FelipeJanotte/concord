/**
 * Moderação (B6): expulsar da voz, silenciar pelo servidor e apagar mensagem.
 * Regras no contrato (`src/shared/types/moderation.ts`: `canModerate`, `canDeleteMessage`);
 * a voz em si fica em `server/modules/voice.ts` (`kickFromVoice`, `setServerMuted`).
 * Skill `concord-moderation`.
 */
import { canDeleteMessage, canModerate, type OkResult } from '../../src/shared/types'
import { allowed, currentAccess, dmMembersOf, emitToViewers } from '../access'
import { guard, type AppSocket, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { deleteMessage, findMessageMeta } from '../repo/messages'
import { storage } from '../storage'
import { kickFromVoice, setServerMuted, voiceStates } from './voice'

const fail = (error: string): OkResult => ({ ok: false, error })

/** Conta logada e dentro do limite de requisições; senão, o erro para o ack. */
function actorOf(socket: AppSocket): { accountId: string; name: string } | OkResult {
  const user = socket.data.user
  if (!user) return fail('Não autenticado')
  const limited = limiters.moderation.take(user.accountId)
  if (!limited.ok) return fail(`Muitas ações seguidas. ${retryText(limited.retryAfterMs)}`)
  return { accountId: user.accountId, name: user.name }
}

export const moderationModule: ServerModule = {
  socket(io, socket) {
    socket.on('moderation:voice-kick', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('moderation:voice-kick', async () => {
        const actor = actorOf(socket)
        if ('ok' in actor) return ack(actor)
        const targetId = typeof payload?.userId === 'string' ? payload.userId : ''
        const state = voiceStates().find((v) => v.userId === targetId)
        const target = io.sockets.sockets.get(targetId)?.data.user
        // Sala que eu não vejo = como se a pessoa não estivesse em sala (não revela sala privada).
        if (!state || !target || !(await allowed(actor.accountId, 'view', state.channelId))) {
          return ack(fail('Essa pessoa não está numa sala de voz'))
        }
        if (!canModerate(await currentAccess(), actor.accountId, target.accountId)) {
          return ack(fail('Você não pode expulsar essa pessoa'))
        }
        // avisa antes do voice:state sem ela, para o app mostrar quem expulsou
        io.to(targetId).emit('moderation:kicked', { channelId: state.channelId, by: actor.name })
        kickFromVoice(io, targetId)
        ack({ ok: true })
      })
    })

    socket.on('moderation:voice-mute', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('moderation:voice-mute', async () => {
        const actor = actorOf(socket)
        if ('ok' in actor) return ack(actor)
        const accountId = typeof payload?.accountId === 'string' ? payload.accountId : ''
        if (typeof payload?.muted !== 'boolean') return ack(fail('Pedido inválido'))
        const access = await currentAccess()
        if (!canModerate(access, actor.accountId, accountId)) return ack(fail('Você não pode silenciar essa pessoa'))
        // Silenciar só quem está numa sala que eu vejo; tirar o silêncio vale sempre (a pessoa pode ter saído).
        if (payload.muted) {
          const rooms = voiceStates()
            .filter((v) => io.sockets.sockets.get(v.userId)?.data.user?.accountId === accountId)
            .map((v) => v.channelId)
          const visible = await Promise.all(rooms.map((id) => allowed(actor.accountId, 'view', id)))
          if (!visible.some(Boolean)) return ack(fail('Essa pessoa não está numa sala de voz'))
        }
        setServerMuted(io, accountId, payload.muted)
        ack({ ok: true })
      })
    })

    socket.on('message:delete', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('message:delete', async () => {
        const actor = actorOf(socket)
        if ('ok' in actor) return ack(actor)
        const meta = typeof payload?.messageId === 'string' ? await findMessageMeta(payload.messageId) : undefined
        // Sem ver o canal = como se a mensagem não existisse.
        if (!meta || !(await allowed(actor.accountId, 'view', meta.channelId))) {
          return ack(fail('Mensagem não encontrada'))
        }
        // Em conversa privada não há moderação: só o autor apaga.
        const isAuthor = meta.authorId === actor.accountId
        const permitted = dmMembersOf(meta.channelId)
          ? isAuthor
          : canDeleteMessage(await currentAccess(), actor.accountId, meta.authorId)
        if (!permitted) return ack(fail('Você não pode apagar esta mensagem'))
        const files = await deleteMessage(payload.messageId)
        if (files === null) return ack(fail('Mensagem não encontrada'))
        for (const id of files) await storage.remove(id).catch(() => {})
        await emitToViewers(io, meta.channelId, 'message:deleted', { channelId: meta.channelId, messageId: payload.messageId })
        ack({ ok: true })
      })
    })
  }
}
