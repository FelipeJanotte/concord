import { omit } from '../utils'
import { get, set } from '../core'
import { openDm } from './friends'
import { loadHistory } from './messages'

function openChat(channelId: string): void {
  set((st) => ({ unread: omit(st.unread, channelId) }))
  void loadHistory(channelId)
}

export function showCommunity(): void {
  set({ section: 'community' })
  const { view, voiceChatOpen } = get()
  if (view?.kind === 'text' || (view?.kind === 'voice' && voiceChatOpen)) openChat(view.channelId)
}

export function openVoiceChat(channelId: string): void {
  set({ section: 'community', view: { kind: 'voice', channelId }, voiceChatOpen: true })
  openChat(channelId)
}

export function setVoiceChatOpen(open: boolean): void {
  set({ voiceChatOpen: open })
  const view = get().view
  if (open && view?.kind === 'voice') openChat(view.channelId)
}

export function showHome(): void {
  set({ section: 'home' })
  const home = get().homeView
  if (home.kind === 'dm') openChat(home.channelId)
}

export function showFriends(): void {
  set({ section: 'home', homeView: { kind: 'friends' } })
}

export function openDmChat(channelId: string): void {
  set({ section: 'home', homeView: { kind: 'dm', channelId } })
  openChat(channelId)
}

export async function messageAccount(accountId: string): Promise<void> {
  const dm = await openDm(accountId)
  openDmChat(dm.channel.id)
}

export function openTool(toolId: string, toolChannelId: string | null = null): void {
  set({ section: 'tool', toolId, toolChannelId })
}

export function showTools(): void {
  set({ section: 'tool', toolChannelId: null })
}

export function showToolGallery(): void {
  set({ section: 'tool', toolId: null, toolChannelId: null })
}

export function isChatOnScreen(st: ReturnType<typeof get>, channelId: string): boolean {
  if (st.section === 'community') {
    if (st.view?.channelId !== channelId) return false
    return st.view.kind === 'text' || (st.view.kind === 'voice' && st.voiceChatOpen)
  }
  if (st.section === 'home') return st.homeView.kind === 'dm' && st.homeView.channelId === channelId
  return false
}
