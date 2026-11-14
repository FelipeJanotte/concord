// Mensagens dos canais de texto e "digitando".
import { randomUUID } from 'node:crypto'
import type { Message } from '../../src/shared/types'
import { guard, type ServerModule } from '../context'
import { findChannel } from '../repo/channels'
import { insertMessage, listMessages } from '../repo/messages'

const MAX_MESSAGE_LENGTH = 2000

export const messagesModule: ServerModule = {
  socket(io, socket) {
    socket.on('message:history', (channelId, ack) => {
      if (typeof ack !== 'function') return
      void guard('message:history', async () => {
        if (!socket.data.user || typeof channelId !== 'string') return ack([])
        ack(await listMessages(channelId))
      })
    })

    socket.on('message:send', (payload) => {
      const user = socket.data.user
      if (!user || !payload || typeof payload.channelId !== 'string') return
      const content = typeof payload.content === 'string' ? payload.content.trim().slice(0, MAX_MESSAGE_LENGTH) : ''
      if (!content) return
      void guard('message:send', async () => {
        const channel = await findChannel(payload.channelId, 'text')
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
    })

    socket.on('typing', (channelId) => {
      const user = socket.data.user
      if (!user || typeof channelId !== 'string') return
      socket.broadcast.emit('typing', { channelId, userId: user.id, name: user.name })
    })
  }
}
