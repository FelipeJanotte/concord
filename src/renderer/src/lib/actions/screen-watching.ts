import { useApp } from '@/store'
import { get, getSocket } from '../core'
import { voice } from '../voice'

export type WatchOrigin = 'room' | 'pip'

const NOTHING_WATCHED: Record<WatchOrigin, string[]> = { room: [], pip: [] }
let watchedByOrigin = NOTHING_WATCHED

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => b[i] === id)
}

function allWatched(): string[] {
  return [...new Set([...watchedByOrigin.room, ...watchedByOrigin.pip])]
}

useApp.subscribe((state, prev) => {
  if (state.myVoiceChannelId === prev.myVoiceChannelId) return
  watchedByOrigin = NOTHING_WATCHED
  voice.setWatchedScreens([])
})

export function watchScreens(origin: WatchOrigin, screenIds: string[]): void {
  const { myVoiceChannelId, self, voice: states } = get()
  if (!myVoiceChannelId) return
  watchedByOrigin = { ...watchedByOrigin, [origin]: screenIds }
  const watched = allWatched()
  voice.setWatchedScreens(watched)
  const known = states.find((v) => v.userId === self?.id)?.watching ?? []
  if (sameIds(watched, known)) return
  getSocket()?.emit('voice:watching', watched)
}
