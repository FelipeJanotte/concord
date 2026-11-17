import type { MusicPlayResult, MusicResult, MusicState, MusicTrack } from '@shared/types'
import { omit } from '../utils'
import { get, notify, requireSocket, set, type AppSocket } from '../core'

export type MusicCommand = { kind: 'play'; query: string } | { kind: 'skip' } | { kind: 'stop' } | { kind: 'queue' } | { kind: 'usage'; text: string }

const PLAY_USAGE = 'Use /play <link ou nome da música>'

export function parseMusicCommand(text: string): MusicCommand | null {
  const match = /^\/(play|skip|stop|queue)(?:\s+(.*))?$/is.exec(text.trim())
  if (!match) return null
  const name = match[1].toLowerCase() as 'play' | 'skip' | 'stop' | 'queue'
  const arg = match[2]?.trim() ?? ''
  if (name === 'play') return arg ? { kind: 'play', query: arg } : { kind: 'usage', text: PLAY_USAGE }
  return { kind: name }
}

export function musicCommandDraft(text: string): { command: string; rest: string; takesQuery: boolean } | null {
  const match = /^(\/(?:play|skip|stop|queue))(\s[\s\S]*)?$/i.exec(text)
  return match ? { command: match[1], rest: match[2] ?? '', takesQuery: match[1].toLowerCase() === '/play' } : null
}

export function applyMusicState(state: MusicState): void {
  const rooms = get().musicRooms
  set({ musicRooms: state.nowPlaying ? { ...rooms, [state.channelId]: state } : omit(rooms, state.channelId) })
}

export function bindMusicEvents(s: AppSocket): void {
  s.on('music:state', applyMusicState)
}

async function request<R extends MusicResult | MusicPlayResult>(send: (s: AppSocket) => Promise<R>): Promise<Extract<R, { ok: true }>> {
  const res = await send(requireSocket())
  if (!res.ok) throw new Error(res.error)
  applyMusicState(res.state)
  return res as Extract<R, { ok: true }>
}

export const playMusic = async (channelId: string, query: string): Promise<{ state: MusicState; added: number }> =>
  request((s) => s.emitWithAck('music:play', { channelId, query }))

export const skipMusic = async (channelId: string): Promise<MusicState> => (await request((s) => s.emitWithAck('music:skip', channelId))).state

export const stopMusic = async (channelId: string): Promise<MusicState> => (await request((s) => s.emitWithAck('music:stop', channelId))).state

export const loadMusicQueue = async (channelId: string): Promise<MusicState> => (await request((s) => s.emitWithAck('music:queue', channelId))).state

export const openMusicQueue = (channelId: string): void => set({ musicQueueChannelId: channelId })

export const closeMusicQueue = (): void => set({ musicQueueChannelId: null })

export const trackLabel = (track: MusicTrack): string => `${track.title} — ${track.artists.join(', ')}`

export function trackDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function announcePlay({ state, added }: { state: MusicState; added: number }): void {
  if (added > 1) return notify(`${added} músicas adicionadas à fila`, 'info')
  const last = state.queue.at(-1)
  if (last) notify(`Na fila: ${trackLabel(last)}`, 'info')
}

async function runCommand(command: MusicCommand, channelId: string): Promise<void> {
  if (command.kind === 'usage') return notify(command.text)
  if (command.kind === 'play') return announcePlay(await playMusic(channelId, command.query))
  if (command.kind === 'skip') return void (await skipMusic(channelId))
  if (command.kind === 'stop') return void (await stopMusic(channelId))
  await loadMusicQueue(channelId)
  openMusicQueue(channelId)
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
