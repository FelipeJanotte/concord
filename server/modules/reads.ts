import type { ChannelRead, ChannelReadResult } from '../../src/shared/types'
import { allowed, currentAccess, visibleChannels } from '../access'
import { guard, type AppServer, type AppSocket, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { listChannels } from '../repo/channels'
import { listDms } from '../repo/dms'
import { advanceRead, readStates } from '../repo/reads'

const NOT_FOUND: ChannelReadResult = { ok: false, error: 'Mensagem não encontrada' }

async function readableChannelIds(accountId: string): Promise<string[]> {
  const community = visibleChannels(await currentAccess(), accountId, await listChannels())
  const dms = await listDms(accountId)
  return [...community.map((c) => c.id), ...dms.map((d) => d.channel.id)]
}

function syncOtherWindows(io: AppServer, reader: AppSocket, accountId: string, read: ChannelRead): void {
  for (const other of io.sockets.sockets.values()) {
    if (other.id !== reader.id && other.data.user?.accountId === accountId) other.emit('channel:read-sync', read)
  }
}

export const readsModule: ServerModule = {
  socket(io, socket) {
    socket.on('channel:reads', (ack) => {
      if (typeof ack !== 'function') return
      void guard('channel:reads', async () => {
        const accountId = socket.data.user?.accountId
        ack(accountId ? await readStates(accountId, await readableChannelIds(accountId)) : [])
      })
    })

    socket.on('channel:read', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('channel:read', async () => {
        const user = socket.data.user
        if (!user) return ack({ ok: false, error: 'Não autenticado' })
        const channelId = payload?.channelId
        const messageId = payload?.messageId
        if (typeof channelId !== 'string' || typeof messageId !== 'string') return ack(NOT_FOUND)
        const limited = limiters.read.take(user.accountId)
        if (!limited.ok) return ack({ ok: false, error: `Muitas leituras seguidas. ${retryText(limited.retryAfterMs)}` })
        if (!(await allowed(user.accountId, 'view', channelId))) return ack(NOT_FOUND)
        const result = await advanceRead(user.accountId, channelId, messageId)
        if (result === 'missing') return ack(NOT_FOUND)
        if (result === 'advanced') syncOtherWindows(io, socket, user.accountId, { channelId, messageId })
        ack({ ok: true })
      })
    })
  }
}
