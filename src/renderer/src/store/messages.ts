// Histórico de mensagens e "digitando".
import type { Message } from '@shared/types'

export interface TypingEntry {
  name: string
  until: number
}

export interface MessagesState {
  /** Histórico carregado por canal (undefined = ainda não carregado) */
  messages: Record<string, Message[]>
  typing: Record<string, Record<string, TypingEntry>>
}

export const messagesInitial: MessagesState = {
  messages: {},
  typing: {}
}
