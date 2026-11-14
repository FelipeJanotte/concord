// Perfil da própria conta e mudanças de perfil dos outros.
import type { ProfileUpdate } from '@shared/types'
import { baseUrl, requireSocket, set, type AppSocket } from '../core'

export function bindAccountEvents(s: AppSocket): void {
  s.on('user:updated', ({ accountId, ...profile }) =>
    set((st) => ({
      users: st.users.map((u) => (u.accountId === accountId ? { ...u, ...profile } : u)),
      self: st.self?.accountId === accountId ? { ...st.self, ...profile } : st.self,
      account: st.account?.id === accountId ? { ...st.account, ...profile } : st.account
    }))
  )
}

export async function updateProfile(update: ProfileUpdate): Promise<void> {
  const res = await requireSocket().emitWithAck('account:update', update)
  if (!res.ok) throw new Error(res.error)
  set({ account: res.account })
}

/** Endereço completo da foto de perfil (o servidor devolve só o caminho). */
export function resolveAvatarUrl(path: string | null | undefined, serverUrl: string | null): string | undefined {
  if (!path) return undefined
  if (/^(https?:|data:|blob:)/.test(path)) return path
  return serverUrl ? baseUrl(serverUrl) + path : undefined
}
