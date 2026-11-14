// Histórico, envio de mensagens e "digitando".
import { omit } from '../utils'
import { get, getSocket, notify, requireSocket, set, type AppSocket } from '../core'

export function bindMessageEvents(s: AppSocket): void {
  s.on('message:new', (message) =>
    set((st) => {
      const list = st.messages[message.channelId]
      const isActive = st.view?.kind === 'text' && st.view.channelId === message.channelId
      const typingInChannel = st.typing[message.channelId]
      return {
        messages: list ? { ...st.messages, [message.channelId]: [...list, message] } : st.messages,
        unread:
          !isActive && message.author.id !== st.self?.id ? { ...st.unread, [message.channelId]: true } : st.unread,
        typing: typingInChannel?.[message.author.id]
          ? { ...st.typing, [message.channelId]: omit(typingInChannel, message.author.id) }
          : st.typing
      }
    })
  )

  s.on('typing', ({ channelId, userId, name: who }) =>
    set((st) => ({
      typing: { ...st.typing, [channelId]: { ...st.typing[channelId], [userId]: { name: who, until: Date.now() + 3500 } } }
    }))
  )
}

const loadingHistory = new Set<string>()

export async function loadHistory(channelId: string): Promise<void> {
  const socket = getSocket()
  if (!socket || get().messages[channelId] || loadingHistory.has(channelId)) return
  loadingHistory.add(channelId)
  try {
    const messages = await socket.emitWithAck('message:history', channelId)
    set((st) => ({ messages: { ...st.messages, [channelId]: messages } }))
  } catch {
    notify('Não foi possível carregar as mensagens')
  } finally {
    loadingHistory.delete(channelId)
  }
}

let lastTypingAt = 0

export function sendMessage(channelId: string, content: string): void {
  const text = content.trim()
  if (!text) return
  requireSocket().emit('message:send', { channelId, content: text })
  lastTypingAt = 0
}

export function notifyTyping(channelId: string): void {
  const now = Date.now()
  if (now - lastTypingAt < 2500) return
  lastTypingAt = now
  getSocket()?.emit('typing', channelId)
}
