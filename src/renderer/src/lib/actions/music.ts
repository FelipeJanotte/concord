import type { MusicPlayResult, MusicResult, MusicState } from '@shared/types'
import { parseCommand } from '../commands'
import { omit } from '../utils'
import { get, notify, requireSocket, set, type AppSocket } from '../core'

type PlayedMusic = Extract<MusicPlayResult, { ok: true }>

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
  const { musicRooms, musicSyncedAt } = get()
  if (!state.nowPlaying) {
    const { roomCollection } = get()
    set({
      musicRooms: omit(musicRooms, state.channelId),
      musicSyncedAt: omit(musicSyncedAt, state.channelId),
      ...(roomCollection?.channelId === state.channelId ? { roomCollection: null } : {})
    })
    return
  }
  set({ musicRooms: { ...musicRooms, [state.channelId]: state }, musicSyncedAt: { ...musicSyncedAt, [state.channelId]: Date.now() } })
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

export async function playMusic(channelId: string, query: string, textChannelId?: string): Promise<PlayedMusic> {
  const played = await request((s) => s.emitWithAck('music:play', { channelId, query, ...fromChat(textChannelId) }))
  set({ roomCollection: played.collection && { channelId, collection: played.collection } })
  return played
}

export const dismissCollection = (): void => set({ roomCollection: null })

export const pauseMusic = async (channelId: string): Promise<MusicState> => (await request((s) => s.emitWithAck('music:pause', { channelId }))).state

export const resumeMusic = async (channelId: string): Promise<MusicState> => (await request((s) => s.emitWithAck('music:resume', { channelId }))).state

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

async function playFromChat(channelId: string, query: string, textChannelId: string): Promise<boolean> {
  const res = await requireSocket().emitWithAck('music:play', { channelId, query, textChannelId })
  if (res.ok) {
    applyMusicState(res.state)
    return true
  }
  notify(res.error)
  return res.posted === true
}

async function runCommand(command: Exclude<MusicCommand, { kind: 'usage' }>, channelId: string, textChannelId: string): Promise<boolean> {
  if (command.kind === 'play') return playFromChat(channelId, command.query, textChannelId)
  if (command.kind === 'skip') await skipMusic(channelId, textChannelId)
  else if (command.kind === 'stop') await stopMusic(channelId, textChannelId)
  else {
    await loadMusicQueue(channelId)
    openMusicQueue(channelId)
  }
  return true
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
    return await runCommand(command, channelId, textChannelId)
  } catch (err) {
    notify(err instanceof Error ? err.message : 'Não foi possível falar com o bot de música')
    return false
  }
}

export function runMusicCommand(text: string, textChannelId: string): Promise<boolean> | null {
  const command = parseMusicCommand(text)
  return command && attempt(command, textChannelId)
}
