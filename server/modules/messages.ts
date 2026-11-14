// Mensagens dos canais de texto e das conversas privadas, e "digitando".
import { randomUUID } from 'node:crypto'
import { ATTACHMENTS_PER_MESSAGE, MESSAGE_MAX_LENGTH, type Message } from '../../src/shared/types'
import { allowed, emitToViewers } from '../access'
import { signMessage } from '../files-signing'
import { guard, type ServerModule } from '../context'
import { limiters } from '../middleware/rate-limit'
import { findChannel } from '../repo/channels'
import { insertMessage, listMessages } from '../repo/messages'
import { isUuid } from '../repo/util'

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

    socket.on('message:send', (payload) => {
      const user = socket.data.user
      if (!user || !payload || typeof payload.channelId !== 'string') return
      const content = typeof payload.content === 'string' ? payload.content.trim().slice(0, MESSAGE_MAX_LENGTH) : ''
      const attachmentIds = payload.attachmentIds ?? []
      if (
        !Array.isArray(attachmentIds) ||
        attachmentIds.length > ATTACHMENTS_PER_MESSAGE ||
        !attachmentIds.every(isUuid) ||
        new Set(attachmentIds).size !== attachmentIds.length
      ) {
        return
      }
      if (!content && attachmentIds.length === 0) return
      const limited = limiters.message.take(user.accountId)
      if (!limited.ok) {
        socket.emit('rate:limited', { action: 'message', retryAfterMs: limited.retryAfterMs })
        return
      }
      const { channelId } = payload
      queue = queue.then(() =>
        guard('message:send', async () => {
          // canal de texto da comunidade ou conversa privada (v3); voz não tem chat
          const channel = await findChannel(channelId)
          if (!channel || channel.type === 'voice') return
          // Sem permissão a mensagem é ignorada (a tela já esconde o campo de quem não pode enviar).
          if (!(await allowed(user.accountId, 'send', channel.id))) return
          if (attachmentIds.length > 0 && !(await allowed(user.accountId, 'attach', channel.id))) return
          const message: Message = {
            id: randomUUID(),
            channelId: channel.id,
            author: { ...user },
            content,
            attachments: [],
            createdAt: Date.now()
          }
          // null = algum anexo não é desta pessoa ou já foi usado: nada é gravado.
          const saved = await insertMessage(message, attachmentIds)
          if (saved) await emitToViewers(io, channel.id, 'message:new', saved, { forAccount: signMessage })
        })
      )
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
