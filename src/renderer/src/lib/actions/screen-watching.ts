import { get, getSocket } from '../core'

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => b[i] === id)
}

export function watchScreens(screenIds: string[]): void {
  const { myVoiceChannelId, self, voice } = get()
  if (!myVoiceChannelId) return
  const known = voice.find((v) => v.userId === self?.id)?.watching ?? []
  if (sameIds(screenIds, known)) return
  getSocket()?.emit('voice:watching', screenIds)
}
