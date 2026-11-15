// Histórico, envio de mensagens e "digitando".
import type { Message } from '@shared/types'
import { omit } from '../utils'
import { get, getSocket, notify, requireSocket, set, type AppSocket } from '../core'
import { isChatOnScreen } from './navigation'
import { clearDraft, isUploading, readyAttachmentIds } from './uploads'

export function bindMessageEvents(s: AppSocket): void {
  s.on('message:new', (message) =>
    set((st) => {
      const list = st.messages[message.channelId]
      const isActive = isChatOnScreen(st, message.channelId)
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

/** Carrega a página mais recente do canal (uma vez; depois as novas chegam por `message:new`). */
export async function loadHistory(channelId: string): Promise<void> {
  const socket = getSocket()
  if (!socket || get().messages[channelId] || loadingHistory.has(channelId)) return
  loadingHistory.add(channelId)
  try {
    const page = await socket.emitWithAck('message:history', { channelId })
    set((st) => ({
      // mensagens que chegaram enquanto a página vinha não se perdem
      messages: { ...st.messages, [channelId]: mergeMessages(page.messages, st.messages[channelId] ?? []) },
      hasMoreHistory: { ...st.hasMoreHistory, [channelId]: page.hasMore }
    }))
  } catch {
    notify('Não foi possível carregar as mensagens')
  } finally {
    loadingHistory.delete(channelId)
  }
}

/** Busca a página anterior à mensagem mais antiga carregada (rolar até o topo do chat). */
export async function loadOlderMessages(channelId: string): Promise<void> {
  const socket = getSocket()
  const st = get()
  const current = st.messages[channelId]
  if (!socket || !current?.length || !st.hasMoreHistory[channelId] || st.loadingOlder[channelId]) return
  set((s) => ({ loadingOlder: { ...s.loadingOlder, [channelId]: true } }))
  try {
    const page = await socket.emitWithAck('message:history', { channelId, before: current[0].id })
    set((s) => {
      const list = s.messages[channelId]
      if (!list) return {} // canal apagado enquanto carregava
      return {
        messages: { ...s.messages, [channelId]: mergeMessages(page.messages, list) },
        hasMoreHistory: { ...s.hasMoreHistory, [channelId]: page.hasMore }
      }
    })
  } catch {
    notify('Não foi possível carregar as mensagens antigas')
  } finally {
    set((s) => ({ loadingOlder: omit(s.loadingOlder, channelId) }))
  }
}

/** Junta `older` antes de `newer`, sem repetir mensagens. */
function mergeMessages(older: Message[], newer: Message[]): Message[] {
  const seen = new Set(newer.map((m) => m.id))
  return [...older.filter((m) => !seen.has(m.id)), ...newer]
}

let lastTypingAt = 0

/**
 * Envia o texto e os anexos prontos do rascunho do canal. Devolve false (sem
 * enviar) se não houver nada ou se ainda houver arquivo subindo.
 */
export function sendMessage(channelId: string, content: string): boolean {
  const text = content.trim()
  if (isUploading(channelId)) return false
  const attachmentIds = readyAttachmentIds(channelId)
  if (!text && attachmentIds.length === 0) return false
  requireSocket().emit(
    'message:send',
    attachmentIds.length ? { channelId, content: text, attachmentIds } : { channelId, content: text }
  )
  clearDraft(channelId, { cancel: false })
  lastTypingAt = 0
  return true
}

export function notifyTyping(channelId: string): void {
  const now = Date.now()
  if (now - lastTypingAt < 2500) return
  lastTypingAt = now
  getSocket()?.emit('typing', channelId)
}
