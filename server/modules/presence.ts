/**
 * Presença: o `hello` (registra a conexão e devolve o estado inicial) e a
 * saída de quem desconecta.
 */
import { accessFor, type User } from '../../src/shared/types'
import { avatarUrl, findAccount, toAccountInfo } from '../auth'
import { guard, users, type ServerModule } from '../context'
import { listChannels } from '../repo/channels'
import type { Account } from '../repo/types'
import { currentAccess, visibleChannels } from '../access'
import { voiceStatesFor } from './voice'

function userFor(socketId: string, a: Account): User {
  return { id: socketId, accountId: a.id, name: a.name, tag: a.tag, color: a.color, avatarUrl: avatarUrl(a) }
}

export const presenceModule: ServerModule = {
  socket(io, socket) {
    socket.on('hello', (ack) => {
      if (typeof ack !== 'function') return
      void guard('hello', async () => {
        const account = await findAccount(socket.data.accountId)
        if (!account) {
          socket.disconnect(true)
          return
        }
        const access = await currentAccess()
        const all = await listChannels()
        const channels = visibleChannels(access, account.id, all)
        // Desconectou enquanto esperava o banco: não registra um usuário fantasma.
        if (!socket.connected) return
        const isNew = !socket.data.user
        const user = userFor(socket.id, account)
        socket.data.user = user
        users.set(socket.id, user)
        ack({
          self: user,
          account: toAccountInfo(account),
          state: {
            channels,
            users: [...users.values()],
            voice: voiceStatesFor(account.id),
            access: accessFor(access, account.id, all.map((c) => c.id))
          }
        })
        if (isNew) socket.broadcast.emit('user:joined', user)
        console.log(`[+] ${account.name}#${account.tag} conectou (${users.size} online)`)
      })
    })

    socket.on('disconnect', () => {
      const user = socket.data.user
      if (users.delete(socket.id)) {
        io.emit('user:left', socket.id)
        console.log(`[-] ${user?.name}#${user?.tag} saiu (${users.size} online)`)
      }
    })
  }
}
