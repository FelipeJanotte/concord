import type { MusicPlayResult, MusicResult, MusicState } from '@shared/types'
import { parseCommand } from '../commands'
import { omit } from '../utils'
import { get, notify, requireSocket, set, type AppSocket } from '../core'

export type MusicCommand = { kind: 'play'; query: string } | { kind: 'skip' } | { kind: 'stop' } | { kind: 'queue' } | { kind: 'usage'; text: string }

const PLAY_USAGE = 'Use /play <link ou nome da música>'
const MUSIC_CONTROLS = ['skip', 'stop', 'queue'] as const
const isMusicControl = (name: string): name is (typeof MUSIC_CONTROLS)[number] => (MUSIC_CONTROLS as readonly string[]).includes(name)

export function parseMusicCommand(text: string): MusicCommand | null {
  const command = parseCommand(text)
  if (!command) return null
  if (command.name === 'play') return command.arg ? { kind: 'play', query: command.arg } : { kind: 'usage', text: PLAY_USAGE }
  return isMusicControl(command.name) ? { kind: command.name } : null
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

const fromChat = (textChannelId?: string): { textChannelId?: string } => (textChannelId ? { textChannelId } : {})

export const playMusic = async (channelId: string, query: string, textChannelId?: string): Promise<{ state: MusicState; added: number }> =>
  request((s) => s.emitWithAck('music:play', { channelId, query, ...fromChat(textChannelId) }))

export const skipMusic = async (channelId: string, textChannelId?: string): Promise<MusicState> =>
  (await request((s) => s.emitWithAck('music:skip', { channelId, ...fromChat(textChannelId) }))).state

export const stopMusic = async (channelId: string, textChannelId?: string): Promise<MusicState> =>
  (await request((s) => s.emitWithAck('music:stop', { channelId, ...fromChat(textChannelId) }))).state

export const loadMusicQueue = async (channelId: string): Promise<MusicState> => (await request((s) => s.emitWithAck('music:queue', channelId))).state

export const openMusicQueue = (channelId: string): void => set({ musicQueueChannelId: channelId })

export const closeMusicQueue = (): void => set({ musicQueueChannelId: null })

export function trackDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

async function runCommand(command: Exclude<MusicCommand, { kind: 'usage' }>, channelId: string, textChannelId: string): Promise<void> {
  if (command.kind === 'play') return void (await playMusic(channelId, command.query, textChannelId))
  if (command.kind === 'skip') return void (await skipMusic(channelId, textChannelId))
  if (command.kind === 'stop') return void (await stopMusic(channelId, textChannelId))
  await loadMusicQueue(channelId)
  openMusicQueue(channelId)
}

async function attempt(command: MusicCommand, textChannelId: string): Promise<boolean> {
  if (command.kind === 'usage') {
    notify(command.text)
    return false
  }
  const channelId = get().myVoiceChannelId
  if (!channelId) {
    notify('Entre numa sala de voz para usar os comandos de música')
    return false
  }
  try {
    await runCommand(command, channelId, textChannelId)
    return true
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Não foi possível falar com o bot de música')
    return false
  }
}

export function runMusicCommand(text: string, textChannelId: string): Promise<boolean> | null {
  const command = parseMusicCommand(text)
  return command && attempt(command, textChannelId)
}
