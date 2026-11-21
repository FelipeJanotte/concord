import { useApp } from '@/store'
import { get, set } from '../core'
import { openDmChat } from './navigation'
import { watchScreens } from './screen-watching'

useApp.subscribe((state, prev) => {
  if (!state.pipScreenId) return
  const leftRoom = prev.pipScreenId !== null && state.myVoiceChannelId !== prev.myVoiceChannelId
  if (leftRoom || !state.screens.includes(state.pipScreenId)) closeScreenPip()
})

export function openScreenPip(screenId: string): void {
  const { myVoiceChannelId, screens } = get()
  if (!myVoiceChannelId || !screens.includes(screenId)) return
  set({ pipScreenId: screenId })
  watchScreens('pip', [screenId])
}

export function closeScreenPip(): void {
  if (get().pipScreenId) set({ pipScreenId: null })
  watchScreens('pip', [])
}

export function leaveRoomView(featured: string[]): void {
  if (featured[0]) openScreenPip(featured[0])
}

export function enterRoomView(): void {
  if (get().pipScreenId) closeScreenPip()
}

export function backToRoom(): void {
  const { myVoiceChannelId: channelId, dms } = get()
  closeScreenPip()
  if (!channelId) return
  if (dms.some((dm) => dm.channel.id === channelId)) openDmChat(channelId)
  else set({ section: 'community', view: { kind: 'voice', channelId } })
}
