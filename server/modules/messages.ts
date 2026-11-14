// Mensagens dos canais de texto e "digitando".
import { randomUUID } from 'node:crypto'
import { ATTACHMENTS_PER_MESSAGE, MESSAGE_MAX_LENGTH, type Message } from '../../src/shared/types'
import { guard, type ServerModule } from '../context'
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
        if (!socket.data.user || typeof channelId !== 'string') return ack({ messages: [], hasMore: false })
        const before = typeof req.before === 'string' ? req.before : undefined
        ack(await listMessages(channelId, { before }))
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
      const { channelId } = payload
      queue = queue.then(() =>
        guard('message:send', async () => {
          const channel = await findChannel(channelId, 'text')
          if (!channel) return
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
          if (saved) io.emit('message:new', saved)
        })
      )
    })

    socket.on('typing', (channelId) => {
      const user = socket.data.user
      if (!user || typeof channelId !== 'string') return
      socket.broadcast.emit('typing', { channelId, userId: user.id, name: user.name })
    })
  }
}
