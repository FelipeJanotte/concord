import { timeoutMessage, type MemberTimeout } from '../../src/shared/types'
import { guard, type AppServer, type ServerModule } from '../context'
import { listServerTimeouts, setServerTimeout } from '../repo/moderation'

const timeouts = new Map<string, { until: number; timer: NodeJS.Timeout }>()
const listeners = new Set<(io: AppServer) => void>()

export function onTimeoutsChange(fn: (io: AppServer) => void): void {
  listeners.add(fn)
}

export function isTimedOut(accountId: string): boolean {
  return timeouts.has(accountId)
}

export function timeoutRefusal(accountId: string): string | null {
  const entry = timeouts.get(accountId)
  return entry ? timeoutMessage(entry.until, Date.now()) : null
}

export function activeTimeouts(): MemberTimeout[] {
  return [...timeouts].map(([accountId, { until }]) => ({ accountId, until }))
}

function forget(accountId: string): void {
  clearTimeout(timeouts.get(accountId)?.timer)
  timeouts.delete(accountId)
}

function remember(io: AppServer, accountId: string, until: number): void {
  forget(accountId)
  const timer = setTimeout(() => void guard('moderation:timeout-end', () => setTimedOut(io, accountId, null)), until - Date.now())
  timer.unref()
  timeouts.set(accountId, { until, timer })
}

export async function setTimedOut(io: AppServer, accountId: string, until: number | null, timedOutBy: string | null = null): Promise<void> {
  await setServerTimeout(accountId, until, timedOutBy)
  if (until === null) forget(accountId)
  else remember(io, accountId, until)
  io.emit('moderation:timeout-changed', { accountId, until })
  for (const fn of listeners) fn(io)
}

export const timeoutsModule: ServerModule = {
  async init(io) {
    for (const accountId of [...timeouts.keys()]) forget(accountId)
    for (const { accountId, until } of await listServerTimeouts()) {
      if (until <= Date.now()) await setServerTimeout(accountId, null)
      else remember(io, accountId, until)
    }
  },

  socket(_io, socket) {
    socket.on('moderation:timeouts', (ack) => {
      if (typeof ack !== 'function') return
      ack(socket.data.user ? activeTimeouts() : [])
    })
  }
}
