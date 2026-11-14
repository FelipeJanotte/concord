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
import { voiceInitial, type VoiceSliceState } from './voice'

export type { View } from './channels'
export type { TypingEntry } from './messages'
export type { ConnectionStatus, Notice } from './session'

export interface AppState extends SessionState, ChannelsState, MessagesState, VoiceSliceState {}

export const initialState: AppState = {
  ...sessionInitial,
  ...channelsInitial,
  ...messagesInitial,
  ...voiceInitial
}

export const useApp = create<AppState>()(() => initialState)
