// Mensagens dos canais de texto e das conversas privadas, "digitando", editar (A15) e responder citando (B18).
import { randomUUID } from 'node:crypto'
import { ATTACHMENTS_PER_MESSAGE, EVERYONE_TOKEN, MESSAGE_MAX_LENGTH, type ChannelKind, type Message, type OkResult } from '../../src/shared/types'
import { allowed, emitToViewers } from '../access'
import { signMessage } from '../files-signing'
import { guard, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { findChannel } from '../repo/channels'
import { editMessage, findEditable, findReplyTarget, insertMessage, listMessages, resolveMentions } from '../repo/messages'
import { isUuid } from '../repo/util'

/** Sem a permissão `mentionEveryone`, o `<@todos>` vira texto comum (B19): ninguém é avisado. */
async function checkEveryone(accountId: string, content: string): Promise<string> {
  if (!content.toLowerCase().includes(EVERYONE_TOKEN)) return content
  if (await allowed(accountId, 'mentionEveryone')) return content
  return content.replace(/<@todos>/gi, '@todos')
}

export async function mentionSafeContent(accountId: string, channelType: ChannelKind, content: string): Promise<string> {
  return channelType === 'dm' ? content.replace(/<@todos>/gi, '@todos') : checkEveryone(accountId, content)
}

export const messagesModule: ServerModule = {
  socket(io, socket) {
    // Mensagens de uma mesma conexão são gravadas e repassadas na ordem em que chegaram.
    let queue: Promise<void> = Promise.resolve()

    socket.on('message:history', (req, ack) => {
      if (typeof ack !== 'function') return
      void guard('message:history', async () => {
        const channelId = req?.channelId
        const user = socket.data.user
        if (!user || typeof channelId !== 'string') return ack({ messages: [], hasMore: false })
        // sem permissão de ver: igual a canal inexistente
        if (!(await allowed(user.accountId, 'view', channelId))) return ack({ messages: [], hasMore: false })
        const before = typeof req.before === 'string' ? req.before : undefined
        const page = await listMessages(channelId, { before })
        // links dos anexos assinados para esta conta
        ack({ ...page, messages: page.messages.map((m) => signMessage(m, user.accountId)) })
      })
    })

    socket.on('message:send', (payload, ack) => {
      const reply = (res: OkResult): void => {
        if (typeof ack === 'function') ack(res)
      }
      const refuse = (error: string): void => reply({ ok: false, error })
      const user = socket.data.user
      if (!user || !payload || typeof payload.channelId !== 'string') return refuse('Mensagem inválida')
      const content = typeof payload.content === 'string' ? payload.content.trim().slice(0, MESSAGE_MAX_LENGTH) : ''
      const attachmentIds = payload.attachmentIds ?? []
      if (
        !Array.isArray(attachmentIds) ||
        attachmentIds.length > ATTACHMENTS_PER_MESSAGE ||
        !attachmentIds.every(isUuid) ||
        new Set(attachmentIds).size !== attachmentIds.length
      ) {
        return refuse('Anexos inválidos')
      }
      if (!content && attachmentIds.length === 0) return refuse('Mensagem vazia')
      const limited = limiters.message.take(user.accountId)
      if (!limited.ok) {
        socket.emit('rate:limited', { action: 'message', retryAfterMs: limited.retryAfterMs })
        return refuse(`Muitas mensagens seguidas. ${retryText(limited.retryAfterMs)}`)
      }
      const { channelId } = payload
      const replyToId = typeof payload.replyToId === 'string' ? payload.replyToId : undefined
      queue = queue.then(() =>
        guard('message:send', async () => {
          // canal de texto, chat da sala de voz (como no Discord) ou conversa privada (v3)
          const channel = await findChannel(channelId)
          if (!channel || !(await allowed(user.accountId, 'view', channel.id))) return refuse('Canal não encontrado')
          if (!(await allowed(user.accountId, 'send', channel.id))) return refuse('Você não tem permissão para enviar mensagens neste canal')
          if (attachmentIds.length > 0 && !(await allowed(user.accountId, 'attach', channel.id))) {
            return refuse('Você não tem permissão para anexar arquivos neste canal')
          }
          // resposta (B18): só a uma mensagem do mesmo canal; inválida = vai sem a citação
          const replyTo = replyToId ? await findReplyTarget(replyToId, channel.id) : undefined
          // menções (B19): @todos só com permissão; numa conversa privada não há @todos
          const text = await mentionSafeContent(user.accountId, channel.type, content)
          const message: Message = {
            id: randomUUID(),
            channelId: channel.id,
            author: { ...user },
            content: text,
            attachments: [],
            createdAt: Date.now(),
            ...(replyTo ? { replyTo } : {})
          }
          // null = algum anexo não é desta pessoa ou já foi usado: nada é gravado.
          const saved = await insertMessage(message, attachmentIds)
          if (!saved) return refuse('Anexos inválidos')
          reply({ ok: true })
          await emitToViewers(io, channel.id, 'message:new', { ...saved, ...(await resolveMentions(text)) }, { forAccount: signMessage })
        })
      )
    })

    // Editar (A15): só o autor, só mensagem de texto, e ainda podendo ver e mandar mensagens no canal.
    socket.on('message:edit', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('message:edit', async () => {
        const user = socket.data.user
        if (!user) return ack({ ok: false, error: 'Não autenticado' })
        if (typeof payload?.messageId !== 'string' || typeof payload.content !== 'string') return ack({ ok: false, error: 'Pedido inválido' })
        const raw = payload.content.trim()
        if (raw.length > MESSAGE_MAX_LENGTH) return ack({ ok: false, error: `A mensagem pode ter no máximo ${MESSAGE_MAX_LENGTH} caracteres` })
        const meta = await findEditable(payload.messageId)
        // sem ver o canal: igual a mensagem inexistente
        if (!meta || !(await allowed(user.accountId, 'view', meta.channelId))) return ack({ ok: false, error: 'Mensagem não encontrada' })
        if (meta.authorId !== user.accountId || meta.kind !== 'text') return ack({ ok: false, error: 'Você só pode editar as suas mensagens' })
        if (!(await allowed(user.accountId, 'send', meta.channelId))) return ack({ ok: false, error: 'Você não pode enviar mensagens neste canal' })
        const content = await checkEveryone(user.accountId, raw)
        if (!content && meta.attachments === 0) return ack({ ok: false, error: 'A mensagem não pode ficar vazia (para tirar, apague)' })
        if (content === meta.content) return ack({ ok: true })
        const limited = limiters.message.take(user.accountId)
        if (!limited.ok) return ack({ ok: false, error: 'Muitas mensagens seguidas. Espere um pouco.' })
        const editedAt = await editMessage(payload.messageId, user.accountId, content)
        if (editedAt === null) return ack({ ok: false, error: 'Mensagem não encontrada' })
        await emitToViewers(io, meta.channelId, 'message:edited', {
          channelId: meta.channelId,
          messageId: payload.messageId,
          content,
          editedAt,
          ...(await resolveMentions(content))
        })
        ack({ ok: true })
      })
    })

    socket.on('typing', (channelId) => {
      const user = socket.data.user
      if (!user || typeof channelId !== 'string') return
      if (!limiters.typing.take(socket.id).ok) return // excesso de "digitando": só ignora
      void guard('typing', async () => {
        if (!(await allowed(user.accountId, 'send', channelId))) return
        await emitToViewers(io, channelId, 'typing', { channelId, userId: user.id, name: user.name }, { exceptSocketId: socket.id })
      })
    })
  }
}
