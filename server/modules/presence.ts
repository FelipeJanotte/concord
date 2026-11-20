/**
 * Presença: o `hello` (registra a conexão e devolve o estado inicial), a
 * saída de quem desconecta e o status (online, ausente, Não perturbe).
 */
import { accessFor, isActivityStatus, presenceStatus, type PresenceStatus, type User } from '../../src/shared/types'
import { activeCustomStatus } from '../../src/shared/profile'
import { avatarUrl, findAccount, publicProfile, toAccountInfo } from '../auth'
import { guard, users, type AppServer, type ServerModule } from '../context'
import { limiters } from '../middleware/rate-limit'
import { listCategories } from '../repo/categories'
import { listChannels } from '../repo/channels'
import { getPreferences } from '../repo/preferences'
import type { Account } from '../repo/types'
import { currentAccess, visibleChannels } from '../access'
import { announcePresence, isOnline } from './friends'
import { voiceStatesFor } from './voice'

const idleConnections = new Set<string>()
const doNotDisturbAccounts = new Set<string>()

function userFor(socketId: string, a: Account): User {
  return { id: socketId, accountId: a.id, name: a.name, tag: a.tag, color: a.color, avatarUrl: avatarUrl(a), ...publicProfile(a) }
}

function onlineUsers(now: number): User[] {
  return [...users.values()].map((u) => ({ ...u, customStatus: activeCustomStatus(u.customStatus, now) }))
}

function accountStatus(accountId: string): PresenceStatus {
  const connections = [...users.values()].filter((u) => u.accountId === accountId)
  return presenceStatus(doNotDisturbAccounts.has(accountId), connections.map((u) => idleConnections.has(u.id)))
}

function onlineStatuses(): Record<string, PresenceStatus> {
  const statuses: Record<string, PresenceStatus> = {}
  for (const { accountId } of users.values()) statuses[accountId] ??= accountStatus(accountId)
  return statuses
}

function emitStatus(io: AppServer, accountId: string): void {
  io.emit('presence:status', { accountId, status: accountStatus(accountId) })
}

function changeStatus(io: AppServer, accountId: string, change: () => void): void {
  const before = accountStatus(accountId)
  change()
  if (isOnline(accountId) && accountStatus(accountId) !== before) emitStatus(io, accountId)
}

function markDoNotDisturb(accountId: string, on: boolean): void {
  if (on) doNotDisturbAccounts.add(accountId)
  else doNotDisturbAccounts.delete(accountId)
}

export function setDoNotDisturb(io: AppServer, accountId: string, on: boolean): void {
  changeStatus(io, accountId, () => markDoNotDisturb(accountId, on))
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
        const categories = await listCategories()
        const { doNotDisturb } = await getPreferences(account.id)
        // Desconectou enquanto esperava o banco: não registra um usuário fantasma.
        if (!socket.connected) return
        const isNew = !socket.data.user
        const wasOnline = isOnline(account.id) // outra janela da mesma conta já estava conectada?
        const before = accountStatus(account.id)
        const user = userFor(socket.id, account)
        socket.data.user = user
        users.set(socket.id, user)
        markDoNotDisturb(account.id, doNotDisturb)
        ack({
          self: user,
          account: toAccountInfo(account),
          state: {
            channels,
            categories,
            users: onlineUsers(Date.now()),
            voice: voiceStatesFor(account.id),
            access: accessFor(access, account.id, all.map((c) => c.id)),
            statuses: onlineStatuses()
          }
        })
        if (isNew) socket.broadcast.emit('user:joined', user)
        if (!wasOnline || accountStatus(account.id) !== before) emitStatus(io, account.id)
        // amigos ficam sabendo quando a conta fica online (só na primeira janela)
        if (!wasOnline) void guard('friend:presence', () => announcePresence(io, account.id, true))
        console.log(`[+] ${account.name}#${account.tag} conectou (${users.size} online)`)
      })
    })

    socket.on('presence:set-status', (status) => {
      const user = socket.data.user
      if (!user || !isActivityStatus(status) || !limiters.presence.take(socket.id).ok) return
      changeStatus(io, user.accountId, () => {
        if (status === 'idle') idleConnections.add(socket.id)
        else idleConnections.delete(socket.id)
      })
    })

    socket.on('disconnect', () => {
      const user = socket.data.user
      if (!user) return
      const before = accountStatus(user.accountId)
      idleConnections.delete(socket.id)
      if (users.delete(socket.id)) {
        io.emit('user:left', socket.id)
        if (!isOnline(user.accountId)) {
          doNotDisturbAccounts.delete(user.accountId)
          // última janela da conta fechou: amigos veem offline
          void guard('friend:presence', () => announcePresence(io, user.accountId, false))
        } else if (accountStatus(user.accountId) !== before) emitStatus(io, user.accountId)
        console.log(`[-] ${user.name}#${user.tag} saiu (${users.size} online)`)
      }
    })
  }
}
