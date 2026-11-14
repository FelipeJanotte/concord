/**
 * Estado global do app (zustand). Só dados, sem ações: as ações ficam em
 * `lib/client.ts` e `lib/actions/*`.
 *
 * Cada domínio tem seu arquivo nesta pasta (interface + estado inicial). Para
 * um domínio novo, crie `<dominio>.ts` e acrescente-o em `AppState` e `initialState`.
 */
import { create } from 'zustand'
import { channelsInitial, type ChannelsState } from './channels'
import { messagesInitial, type MessagesState } from './messages'
import { sessionInitial, type SessionState } from './session'
import { uploadsInitial, type UploadsState } from './uploads'
import { voiceInitial, type VoiceSliceState } from './voice'

export type { View } from './channels'
export type { TypingEntry } from './messages'
export type { ConnectionStatus, Notice } from './session'
export type { PendingUpload } from './uploads'

export interface AppState extends SessionState, ChannelsState, MessagesState, UploadsState, VoiceSliceState {}

export const initialState: AppState = {
  ...sessionInitial,
  ...channelsInitial,
  ...messagesInitial,
  ...uploadsInitial,
  ...voiceInitial
}

export const useApp = create<AppState>()(() => initialState)
