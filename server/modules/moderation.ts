/**
 * Moderação (B6): expulsar da voz, mover para outra sala, silenciar pelo servidor e apagar mensagem.
 * Regras no contrato (`src/shared/types/moderation.ts`: `canModerate`, `canDeleteMessage`);
 * a voz em si fica em `server/modules/voice.ts` (`kickFromVoice`, `setServerMuted`).
 * Skill `concord-moderation`.
 */
import { canDeleteMessage, canModerate, type OkResult } from '../../src/shared/types'
import { allowed, currentAccess, dmMembersOf, emitToViewers } from '../access'
import { guard, type AppSocket, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { findChannel } from '../repo/channels'
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

    // Mover para outra sala (como no Discord): mesma regra do expulsar. Não tira ninguém à força no
    // LiveKit: avisa a conexão (`moderation:moved`) e o app troca de sala pelo `voice:join` de sempre,
    // que confere a permissão de novo e emite o token (igual ao "Mover para as salas" do sorteador).
    socket.on('moderation:voice-move', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('moderation:voice-move', async () => {
        const actor = actorOf(socket)
        if ('ok' in actor) return ack(actor)
        const targetId = typeof payload?.userId === 'string' ? payload.userId : ''
        const channelId = typeof payload?.channelId === 'string' ? payload.channelId : ''
        const state = voiceStates().find((v) => v.userId === targetId)
        const target = io.sockets.sockets.get(targetId)?.data.user
        // Sala que eu não vejo = como se a pessoa não estivesse em sala (não revela sala privada).
        if (!state || !target || !(await allowed(actor.accountId, 'view', state.channelId))) {
          return ack(fail('Essa pessoa não está numa sala de voz'))
        }
        if (dmMembersOf(state.channelId)) return ack(fail('Não dá para mover alguém de uma chamada privada'))
        if (!canModerate(await currentAccess(), actor.accountId, target.accountId)) {
          return ack(fail('Você não pode mover essa pessoa'))
        }
        const channel = channelId ? await findChannel(channelId) : undefined
        if (!channel || channel.type !== 'voice' || !(await allowed(actor.accountId, 'view', channel.id))) {
          return ack(fail('Sala de voz não encontrada'))
        }
        if (state.channelId === channel.id) return ack(fail('Essa pessoa já está nessa sala'))
        if (!(await allowed(target.accountId, 'view', channel.id)) || !(await allowed(target.accountId, 'connect', channel.id))) {
          return ack(fail('Essa pessoa não tem acesso a essa sala'))
        }
        io.to(targetId).emit('moderation:moved', { channelId: channel.id, by: actor.name })
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
        await setServerMuted(io, accountId, payload.muted, actor.accountId)
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
