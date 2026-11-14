import type { VoiceState } from '@shared/types'

/**
 * Quem entrou e quem saiu da MINHA sala entre dois `voice:state`. A própria conexão
 * (`selfId`) fica de fora: os sons dela tocam em `joinVoice`/`leaveVoice`.
 */
export function roomChanges(
  prev: VoiceState[],
  next: VoiceState[],
  myChannelId: string,
  selfId: string | undefined
): { joined: string[]; left: string[] } {
  const inRoom = (list: VoiceState[]): Set<string> =>
    new Set(list.filter((v) => v.channelId === myChannelId && v.userId !== selfId).map((v) => v.userId))
  const before = inRoom(prev)
  const after = inRoom(next)
  return {
    joined: [...after].filter((id) => !before.has(id)),
    left: [...before].filter((id) => !after.has(id))
  }
}
