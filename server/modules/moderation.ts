/**
 * Moderação (B6): expulsar da voz, mover para outra sala, silenciar pelo servidor e apagar mensagem.
 * Regras no contrato (`src/shared/types/moderation.ts`: `canModerate`, `canMoveMember`, `canDeleteMessage`);
 * a voz em si fica em `server/modules/voice.ts` (`kickFromVoice`, `setServerMuted`).
 * Skill `concord-moderation`.
 */
import {
  BAN_REASON_MAX_LENGTH,
  canBanMember,
  canDeleteMessage,
  canKickMember,
  canModerate,
  canMoveMember,
  canTimeoutMember,
  TIMEOUT_MAX_MINUTES,
  type CommunityRemoval,
  type OkResult
} from '../../src/shared/types'
import { allowed, currentAccess, dmMembersOf, emitToViewers } from '../access'
import { guard, type AppServer, type AppSocket, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { findAccount } from '../repo/accounts'
import { recordAudit } from '../repo/audit'
import { findChannel } from '../repo/channels'
import { deleteMessage, findMessageMeta } from '../repo/messages'
import { deleteCommunityBan, insertCommunityBan, listCommunityBans } from '../repo/moderation'
import { deleteAccountSessions } from '../repo/sessions'
import { storage } from '../storage'
import { setTimedOut } from './timeouts'
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

const MINUTE_MS = 60_000

async function removeFromCommunity(io: AppServer, accountId: string, removal: CommunityRemoval): Promise<void> {
  await deleteAccountSessions(accountId)
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.accountId !== accountId) continue
    socket.emit('moderation:removed', removal)
    socket.disconnect(true)
  }
}

function banReason(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'string') return undefined
  const reason = raw.trim()
  return reason.length > BAN_REASON_MAX_LENGTH ? undefined : reason || null
}

const isTimeoutMinutes = (minutes: unknown): minutes is number =>
  typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 0 && minutes <= TIMEOUT_MAX_MINUTES

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
        await recordAudit({
          actorId: actor.accountId,
          action: 'voice-kick',
          targetId: target.accountId,
          details: { channelName: (await findChannel(state.channelId))?.name ?? '' }
        })
        ack({ ok: true })
      })
    })

    // Mover para outra sala (como no Discord): `canMoveMember` (`moveMembers` ou `manageMembers`). Não tira ninguém à força no
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
        if (!canMoveMember(await currentAccess(), actor.accountId, target.accountId)) {
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
        await recordAudit({ actorId: actor.accountId, action: 'voice-move', targetId: target.accountId, details: { channelName: channel.name } })
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
        await recordAudit({ actorId: actor.accountId, action: payload.muted ? 'voice-mute' : 'voice-unmute', targetId: accountId, details: {} })
        ack({ ok: true })
      })
    })

    socket.on('moderation:kick', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('moderation:kick', async () => {
        const actor = actorOf(socket)
        if ('ok' in actor) return ack(actor)
        const accountId = typeof payload?.accountId === 'string' ? payload.accountId : ''
        if (!canKickMember(await currentAccess(), actor.accountId, accountId)) {
          return ack(fail('Você não pode expulsar essa pessoa da comunidade'))
        }
        if (!(await findAccount(accountId))) return ack(fail('Pessoa não encontrada'))
        await removeFromCommunity(io, accountId, { kind: 'kick', by: actor.name })
        await recordAudit({ actorId: actor.accountId, action: 'kick', targetId: accountId, details: {} })
        ack({ ok: true })
      })
    })

    socket.on('moderation:ban', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('moderation:ban', async () => {
        const actor = actorOf(socket)
        if ('ok' in actor) return ack(actor)
        const accountId = typeof payload?.accountId === 'string' ? payload.accountId : ''
        if (!canBanMember(await currentAccess(), actor.accountId, accountId)) return ack(fail('Você não pode banir essa pessoa'))
        const reason = banReason(payload?.reason)
        if (reason === undefined) return ack(fail(`O motivo pode ter no máximo ${BAN_REASON_MAX_LENGTH} caracteres`))
        const target = await findAccount(accountId)
        if (!target) return ack(fail('Pessoa não encontrada'))
        await insertCommunityBan({ accountId, email: target.email, reason, bannedBy: actor.accountId })
        await removeFromCommunity(io, accountId, { kind: 'ban', reason })
        await recordAudit({ actorId: actor.accountId, action: 'ban', targetId: accountId, details: { reason } })
        ack({ ok: true })
      })
    })

    socket.on('moderation:unban', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('moderation:unban', async () => {
        const actor = actorOf(socket)
        if ('ok' in actor) return ack(actor)
        if (!(await allowed(actor.accountId, 'banMembers'))) return ack(fail('Você não pode tirar banimentos'))
        const accountId = typeof payload?.accountId === 'string' ? payload.accountId : ''
        if (!(await deleteCommunityBan(accountId))) return ack(fail('Essa pessoa não está banida'))
        await recordAudit({ actorId: actor.accountId, action: 'unban', targetId: accountId, details: {} })
        ack({ ok: true })
      })
    })

    socket.on('moderation:bans', (ack) => {
      if (typeof ack !== 'function') return
      void guard('moderation:bans', async () => {
        const user = socket.data.user
        if (!user || !(await allowed(user.accountId, 'banMembers'))) return ack({ ok: false, error: 'Você não pode ver os banimentos' })
        ack({ ok: true, bans: await listCommunityBans() })
      })
    })

    socket.on('moderation:timeout', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('moderation:timeout', async () => {
        const actor = actorOf(socket)
        if ('ok' in actor) return ack(actor)
        const accountId = typeof payload?.accountId === 'string' ? payload.accountId : ''
        const minutes = payload?.minutes
        if (!isTimeoutMinutes(minutes)) return ack(fail('Escolha de 1 minuto a 7 dias'))
        if (!canTimeoutMember(await currentAccess(), actor.accountId, accountId)) {
          return ack(fail('Você não pode pôr essa pessoa de castigo'))
        }
        if (!(await findAccount(accountId))) return ack(fail('Pessoa não encontrada'))
        await setTimedOut(io, accountId, minutes === 0 ? null : Date.now() + minutes * MINUTE_MS, actor.accountId)
        await recordAudit(
          minutes === 0
            ? { actorId: actor.accountId, action: 'timeout-clear', targetId: accountId, details: {} }
            : { actorId: actor.accountId, action: 'timeout', targetId: accountId, details: { minutes } }
        )
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
        const channel = await findChannel(meta.channelId)
        const files = await deleteMessage(payload.messageId)
        if (files === null) return ack(fail('Mensagem não encontrada'))
        if (!isAuthor && channel) {
          await recordAudit({
            actorId: actor.accountId,
            action: 'message-delete',
            targetId: meta.authorId,
            details: { messageId: payload.messageId, channel: { name: channel.name, type: channel.type } }
          })
        }
        for (const id of files) await storage.remove(id).catch(() => {})
        await emitToViewers(io, meta.channelId, 'message:deleted', { channelId: meta.channelId, messageId: payload.messageId })
        ack({ ok: true })
      })
    })
  }
}
