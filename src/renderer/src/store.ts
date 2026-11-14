import { create } from 'zustand'
import type { AccountInfo, Channel, Message, User, VoiceState } from '@shared/types'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface View {
  kind: 'text' | 'voice'
  channelId: string
}

export interface TypingEntry {
  name: string
  until: number
}

export interface Notice {
  id: number
  text: string
  kind: 'error' | 'info'
}

export interface AppState {
  status: ConnectionStatus
  serverUrl: string | null
  self: User | null
  /** dados da própria conta (e-mail, nome#tag, foto) */
  account: AccountInfo | null
  /** tentando entrar com a sessão salva ao abrir o app */
  restoring: boolean
  channels: Channel[]
  users: User[]
  voice: VoiceState[]
  /** Histórico carregado por canal (undefined = ainda não carregado) */
  messages: Record<string, Message[]>
  unread: Record<string, boolean>
  view: View | null
  myVoiceChannelId: string | null
  joiningVoice: boolean
  muted: boolean
  deafened: boolean
  /** na sala de voz sem microfone (só ouvindo) */
  noMic: boolean
  speaking: Record<string, boolean>
  typing: Record<string, Record<string, TypingEntry>>
  notice: Notice | null
}

export const initialState: AppState = {
  status: 'disconnected',
  serverUrl: null,
  self: null,
  account: null,
  restoring: false,
  channels: [],
  users: [],
  voice: [],
  messages: {},
  unread: {},
  view: null,
  myVoiceChannelId: null,
  joiningVoice: false,
  muted: false,
  deafened: false,
  noMic: false,
  speaking: {},
  typing: {},
  notice: null
}

export const useApp = create<AppState>()(() => initialState)
