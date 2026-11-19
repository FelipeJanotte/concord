// Quem entra e sai do servidor.
import type { IdleBridge } from '@shared/idle'
import { get, getSocket, notify, requireSocket, set, type AppSocket } from '../core'

export const idleEnv = {
  bridge: (): IdleBridge | null => (typeof window !== 'undefined' ? (window.api?.idle ?? null) : null)
}

let systemIdle = false
let watchingIdle = false

function sendActivity(): void {
  getSocket()?.emit('presence:set-status', systemIdle ? 'idle' : 'online')
}

function watchSystemIdle(): void {
  const bridge = idleEnv.bridge()
  if (watchingIdle || !bridge) return
  watchingIdle = true
  bridge.onChange((idle) => {
    systemIdle = idle
    sendActivity()
  })
}

export function bindPresenceEvents(s: AppSocket): void {
  s.on('user:joined', (user) => set((st) => ({ users: [...st.users.filter((u) => u.id !== user.id), user] })))
  s.on('user:left', (userId) => set((st) => ({ users: st.users.filter((u) => u.id !== userId) })))
  s.on('presence:status', ({ accountId, status }) => set((st) => ({ statuses: { ...st.statuses, [accountId]: status } })))
  watchSystemIdle()
}

export async function syncActivityStatus(): Promise<void> {
  const bridge = idleEnv.bridge()
  if (!bridge) return
  systemIdle = await bridge.isIdle()
  if (systemIdle) sendActivity()
}

export async function setDoNotDisturb(on: boolean): Promise<void> {
  const before = get().doNotDisturb
  set({ doNotDisturb: on })
  const res = await requireSocket().emitWithAck('preferences:update', { doNotDisturb: on })
  if (res.ok) return
  set({ doNotDisturb: before })
  notify(`Não foi possível mudar o Não perturbe: ${res.error}`)
}
