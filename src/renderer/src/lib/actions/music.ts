import type { MusicResult, MusicState, MusicTrack } from '@shared/types'
import { omit } from '../utils'
import { get, notify, requireSocket, set, type AppSocket } from '../core'

export type MusicCommand =
  | { kind: 'play'; url: string }
  | { kind: 'skip' }
  | { kind: 'stop' }
  | { kind: 'queue' }
  | { kind: 'usage'; text: string }

const PLAY_USAGE = 'Use /tocar <link do Spotify>'

export function parseMusicCommand(text: string): MusicCommand | null {
  const match = /^\/(tocar|pular|parar|fila)(?:\s+(.*))?$/is.exec(text.trim())
  if (!match) return null
  const name = match[1].toLowerCase()
  const arg = match[2]?.trim() ?? ''
  if (name === 'tocar') return arg ? { kind: 'play', url: arg } : { kind: 'usage', text: PLAY_USAGE }
  return { kind: name === 'pular' ? 'skip' : name === 'parar' ? 'stop' : 'queue' }
}

export function applyMusicState(state: MusicState): void {
  const rooms = get().musicRooms
  set({ musicRooms: state.nowPlaying ? { ...rooms, [state.channelId]: state } : omit(rooms, state.channelId) })
}

export function bindMusicEvents(s: AppSocket): void {
  s.on('music:state', applyMusicState)
}

async function request(send: (s: AppSocket) => Promise<MusicResult>): Promise<MusicState> {
  const res = await send(requireSocket())
  if (!res.ok) throw new Error(res.error)
  applyMusicState(res.state)
  return res.state
}

export const playMusic = (channelId: string, url: string): Promise<MusicState> =>
  request((s) => s.emitWithAck('music:play', { channelId, url }))

export const skipMusic = (channelId: string): Promise<MusicState> => request((s) => s.emitWithAck('music:skip', channelId))

export const stopMusic = (channelId: string): Promise<MusicState> => request((s) => s.emitWithAck('music:stop', channelId))

export const loadMusicQueue = (channelId: string): Promise<MusicState> => request((s) => s.emitWithAck('music:queue', channelId))

export const trackLabel = (track: MusicTrack): string => `${track.title} — ${track.artists.join(', ')}`

export function describeQueue(state: MusicState): string {
  if (!state.nowPlaying) return 'Nenhuma música tocando.'
  const now = `Tocando agora: ${trackLabel(state.nowPlaying)}`
  if (!state.queue.length) return `${now}. Fila vazia.`
  return `${now}. Na fila: ${state.queue.map((t, i) => `${i + 1}. ${trackLabel(t)}`).join('; ')}`
}

async function runCommand(command: MusicCommand, channelId: string): Promise<void> {
  if (command.kind === 'usage') return notify(command.text)
  if (command.kind === 'play') {
    const state = await playMusic(channelId, command.url)
    const added = state.queue.at(-1) ?? state.nowPlaying
    if (state.queue.length && added) notify(`Na fila: ${trackLabel(added)}`, 'info')
    return
  }
  if (command.kind === 'skip') return void (await skipMusic(channelId))
  if (command.kind === 'stop') return void (await stopMusic(channelId))
  notify(describeQueue(await loadMusicQueue(channelId)), 'info')
}

export function runMusicCommand(text: string): boolean {
  const command = parseMusicCommand(text)
  if (!command) return false
  const channelId = get().myVoiceChannelId
  if (!channelId) {
    notify('Entre numa sala de voz para usar os comandos de música')
    return true
  }
  runCommand(command, channelId).catch((err: unknown) => notify(err instanceof Error ? err.message : 'Não foi possível falar com o bot de música'))
  return true
}
