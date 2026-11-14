// Mensagens dos canais de texto e "digitando".
import { randomUUID } from 'node:crypto'
import { MESSAGE_MAX_LENGTH, type Message } from '../../src/shared/types'
import { guard, type ServerModule } from '../context'
import { findChannel } from '../repo/channels'
import { insertMessage, listMessages } from '../repo/messages'

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
      if (!content) return
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
            createdAt: Date.now()
          }
          await insertMessage(message)
          io.emit('message:new', message)
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
