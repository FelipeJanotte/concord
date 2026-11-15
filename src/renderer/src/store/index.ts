/**
 * Estado global do app (zustand). Só dados, sem ações: as ações ficam em
 * `lib/client.ts` e `lib/actions/*`.
 *
 * Cada domínio tem seu arquivo nesta pasta (interface + estado inicial). Para
 * um domínio novo, crie `<dominio>.ts` e acrescente-o em `AppState` e `initialState`.
 */
import { create } from 'zustand'
import { callsInitial, type CallsState } from './calls'
import { channelsInitial, type ChannelsState } from './channels'
import { devicesInitial, type DevicesState } from './devices'
import { friendsInitial, type FriendsState } from './friends'
import { preferencesInitial, type PreferencesState } from './preferences'
import { toolsInitial, type ToolsState } from './tools'
import { navigationInitial, type NavigationState } from './navigation'
import { messagesInitial, type MessagesState } from './messages'
import { permissionsInitial, type PermissionsState } from './permissions'
import { sessionInitial, type SessionState } from './session'
import { soundsInitial, type SoundsState } from './sounds'
import { uploadsInitial, type UploadsState } from './uploads'
import { voiceInitial, type VoiceSliceState } from './voice'

export type { View } from './channels'
export type { HomeView, Section } from './navigation'
export type { TypingEntry } from './messages'
export type { ConnectionStatus, Notice } from './session'
export type { PendingUpload } from './uploads'
export type { PlayingSound } from './sounds'

export interface AppState extends SessionState, ChannelsState, MessagesState, UploadsState, VoiceSliceState, DevicesState, PermissionsState, FriendsState, ToolsState, PreferencesState, NavigationState, CallsState, SoundsState {}

export const initialState: AppState = {
  ...sessionInitial,
  ...channelsInitial,
  ...messagesInitial,
  ...uploadsInitial,
  ...voiceInitial,
  ...devicesInitial,
  ...permissionsInitial,
  ...friendsInitial,
  ...toolsInitial,
  ...preferencesInitial,
  ...navigationInitial,
  ...callsInitial,
  ...soundsInitial
}

export const useApp = create<AppState>()(() => initialState)
