// Mensagens dos canais de texto e "digitando".
import type { User } from './account'

export interface Message {
  id: string
  channelId: string
  /** cópia do usuário no momento do envio */
  author: User
  content: string
  createdAt: number
}

// ---------- Eventos ----------

export interface MessageServerEvents {
  'message:new': (message: Message) => void
  typing: (payload: { channelId: string; userId: string; name: string }) => void
}

export interface MessageClientEvents {
  'message:history': (channelId: string, ack: (messages: Message[]) => void) => void
  'message:send': (payload: { channelId: string; content: string }) => void
  typing: (channelId: string) => void
}
