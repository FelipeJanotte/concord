// Canais: criar e apagar.
import { randomUUID } from 'node:crypto'
import type { Channel, ChannelType } from '../../src/shared/types'
import { allowed, emitToViewers, reloadAccess } from '../access'
import { guard, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { channelNameExists, countChannels, deleteChannel, insertChannel } from '../repo/channels'
import { DuplicateError } from '../repo/util'
import { attachmentIdsInChannel } from '../repo/attachments'
import { storage } from '../storage'
import { clearVoiceChannel, emitVoice } from './voice'

const MAX_CHANNELS = 100

function normalizeChannelName(raw: unknown, type: ChannelType): string | null {
  if (typeof raw !== 'string') return null
  let name = raw.trim().replace(/\s+/g, ' ')
  if (type === 'text') name = name.toLowerCase().replace(/ /g, '-')
  name = name.slice(0, 32)
  return name || null
}

export const channelsModule: ServerModule = {
  socket(io, socket) {
    socket.on('channel:create', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('channel:create', async () => {
        if (!socket.data.user) return ack({ ok: false, error: 'Não autenticado' })
        if (!(await allowed(socket.data.user.accountId, 'manageChannels'))) {
          return ack({ ok: false, error: 'Você não tem permissão para criar canais' })
        }
        const type: ChannelType = payload?.type === 'voice' ? 'voice' : 'text'
        const name = normalizeChannelName(payload?.name, type)
        if (!name) return ack({ ok: false, error: 'Dê um nome ao canal' })
        const limited = limiters.channel.take(socket.data.user.accountId)
        if (!limited.ok) return ack({ ok: false, error: `Muitos canais criados seguidos. ${retryText(limited.retryAfterMs)}` })
        if ((await countChannels()) >= MAX_CHANNELS) return ack({ ok: false, error: 'Limite de canais atingido' })
        if (await channelNameExists(type, name)) return ack({ ok: false, error: 'Já existe um canal com esse nome' })
        const channel: Channel = { id: randomUUID(), name, type, createdAt: Date.now() }
        try {
          await insertChannel(channel)
        } catch (err) {
          // Dois pedidos iguais ao mesmo tempo: o banco recusa o segundo.
          if (err instanceof DuplicateError) return ack({ ok: false, error: 'Já existe um canal com esse nome' })
          throw err
        }
        // canal novo não tem regras: aparece para quem o @todos (ou um cargo) deixa ver
        await emitToViewers(io, channel.id, 'channel:created', channel)
        ack({ ok: true, channel })
      })
    })

    socket.on('channel:delete', (channelId) => {
      const user = socket.data.user
      if (!user || typeof channelId !== 'string') return
      void guard('channel:delete', async () => {
        if (!(await allowed(user.accountId, 'manageChannels'))) return
        const files = await attachmentIdsInChannel(channelId)
        if (!(await deleteChannel(channelId))) return
        // os registros dos anexos saíram junto (cascade); os arquivos, apagamos aqui
        for (const id of files) await storage.remove(id)
        await reloadAccess() // as regras do canal também saíram (cascade)
        clearVoiceChannel(io, channelId)
        io.emit('channel:deleted', channelId)
        emitVoice(io)
      })
    })
  }
}
