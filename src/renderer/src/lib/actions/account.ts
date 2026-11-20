// Perfil da própria conta e mudanças de perfil dos outros.
import type { CustomStatus, FriendAccount, ProfileUpdate } from '@shared/types'
import { requireSocket, resolveServerUrl, set, type AppSocket } from '../core'

export function bindAccountEvents(s: AppSocket): void {
  s.on('user:updated', ({ accountId, ...profile }) => {
    const changed = (account: FriendAccount): FriendAccount => ({ ...account, ...profile })
    set((st) => ({
      users: st.users.map((u) => (u.accountId === accountId ? { ...u, ...profile } : u)),
      self: st.self?.accountId === accountId ? { ...st.self, ...profile } : st.self,
      account: st.account?.id === accountId ? { ...st.account, ...profile } : st.account,
      friends: st.friends.map((f) => (f.account.id === accountId ? { ...f, account: changed(f.account) } : f)),
      dms: st.dms.map((d) => (d.other.id === accountId ? { ...d, other: changed(d.other) } : d))
    }))
  })
}

export async function updateProfile(update: ProfileUpdate): Promise<void> {
  const res = await requireSocket().emitWithAck('account:update', update)
  if (!res.ok) throw new Error(res.error)
  set({ account: res.account })
}

export function setCustomStatus(customStatus: CustomStatus | null): Promise<void> {
  return updateProfile({ customStatus })
}

/** Endereço completo da foto de perfil (o servidor devolve só o caminho). */
export const resolveAvatarUrl = resolveServerUrl
