// Quem entra e sai do servidor.
import { set, type AppSocket } from '../core'

export function bindPresenceEvents(s: AppSocket): void {
  s.on('user:joined', (user) => set((st) => ({ users: [...st.users.filter((u) => u.id !== user.id), user] })))
  s.on('user:left', (userId) => set((st) => ({ users: st.users.filter((u) => u.id !== userId) })))
}
