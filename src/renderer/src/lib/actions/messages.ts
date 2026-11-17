// Histórico, envio de mensagens e "digitando".
import { replyPreviewText, type Mention, type Message, type MessageEdited } from '@shared/types'
import { omit } from '../utils'
import { get, getSocket, notify, requireSocket, set, type AppSocket } from '../core'
import { isChatOnScreen } from './navigation'
import { loadMyPollVotes } from './tools'
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
          !isActive && message.author.id !== st.self?.id && !st.mutedChannels.includes(message.channelId) ? { ...st.unread, [message.channelId]: true } : st.unread,
        typing: typingInChannel?.[message.author.id]
          ? { ...st.typing, [message.channelId]: omit(typingInChannel, message.author.id) }
          : st.typing
      }
    })
  )

  // editada (A15): troca o texto e atualiza as citações que apontam para ela (B18)
  s.on('message:edited', applyRemoteEdit)

  // apagada (B6): as respostas a ela passam a citar "mensagem apagada" (a lista em si é tratada em moderation.ts)
  s.on('message:deleted', ({ channelId, messageId }) =>
    set((st) => {
      const list = st.messages[channelId]
      if (!list?.some((m) => m.replyTo?.id === messageId)) return {}
      return {
        messages: {
          ...st.messages,
          [channelId]: list.map((m) =>
            m.replyTo?.id === messageId ? { ...m, replyTo: { id: messageId, authorName: '', authorAccountId: null, content: '', deleted: true } } : m
          )
        }
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
    void loadMyPollVotes(page.messages) // enquetes do histórico: marca o que eu já votei
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
    void loadMyPollVotes(page.messages)
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

export const SEND_TIMEOUT_MS = 10_000

/**
 * Envia o texto e os anexos prontos do rascunho do canal. Devolve false (sem
 * enviar) se não houver nada ou se ainda houver arquivo subindo.
 */
export function sendMessage(channelId: string, content: string): boolean {
  const text = content.trim()
  if (isUploading(channelId)) return false
  const attachmentIds = readyAttachmentIds(channelId)
  if (!text && attachmentIds.length === 0) return false
  const replyToId = get().replyingTo[channelId]?.id
  requireSocket()
    .timeout(SEND_TIMEOUT_MS)
    .emitWithAck('message:send', {
      channelId,
      content: text,
      ...(attachmentIds.length ? { attachmentIds } : {}),
      ...(replyToId ? { replyToId } : {})
    })
    .then(
      (res) => {
        if (!res.ok) notify(`Mensagem não enviada: ${res.error}`)
      },
      () => notify('Mensagem não enviada: o servidor não respondeu')
    )
  clearDraft(channelId, { cancel: false })
  if (replyToId) cancelReply(channelId)
  lastTypingAt = 0
  return true
}

export function notifyTyping(channelId: string): void {
  const now = Date.now()
  if (now - lastTypingAt < 2500) return
  lastTypingAt = now
  getSocket()?.emit('typing', channelId)
}

// ---------- Editar (A15) e responder citando (B18) ----------

function applyEdit(channelId: string, messageId: string, content: string, change: (m: Message) => Message): void {
  set((st) => {
    const list = st.messages[channelId]
    if (!list) return {}
    const preview = replyPreviewText(content)
    return {
      messages: {
        ...st.messages,
        [channelId]: list.map((m) => {
          if (m.id === messageId) return change(m)
          if (m.replyTo?.id === messageId && !m.replyTo.deleted) return { ...m, replyTo: { ...m.replyTo, content: preview } }
          return m
        })
      }
    }
  })
}

function withMentions({ mentions: _old, ...message }: Message, mentions: Mention[] | undefined): Message {
  return mentions?.length ? { ...message, mentions } : message
}

function applyRemoteEdit(edit: MessageEdited): void {
  const { channelId, messageId, content } = edit
  if ('tool' in edit) return applyEdit(channelId, messageId, content, (m) => ({ ...m, content, tool: edit.tool }))
  applyEdit(channelId, messageId, content, (m) => withMentions({ ...m, content, editedAt: edit.editedAt }, edit.mentions))
}

/** Começa a responder a esta mensagem: o campo do canal mostra "Respondendo a Fulano". */
export function startReply(message: Message): void {
  set((st) => ({
    editingMessageId: null,
    replyingTo: {
      ...st.replyingTo,
      [message.channelId]: {
        id: message.id,
        authorName: message.author.name,
        authorAccountId: message.author.accountId || null,
        content: replyPreviewText(message.content)
      }
    }
  }))
}

export function cancelReply(channelId: string): void {
  set((st) => ({ replyingTo: omit(st.replyingTo, channelId) }))
}

/** Abre a edição no lugar (só uma mensagem por vez). */
export function startEdit(messageId: string): void {
  set({ editingMessageId: messageId })
}

export function cancelEdit(): void {
  set({ editingMessageId: null })
}

/**
 * Seta para cima no campo vazio: edita a minha última mensagem de texto do canal (como no Discord).
 * Devolve true se abriu a edição.
 */
export function editLastMessage(channelId: string): boolean {
  const st = get()
  const me = st.self?.accountId
  const last = [...(st.messages[channelId] ?? [])].reverse().find((m) => m.author.accountId === me && (m.kind ?? 'text') === 'text')
  if (!last) return false
  startEdit(last.id)
  return true
}

/** Salva a edição. Lança `Error` com a mensagem do servidor; texto igual só fecha a edição. */
export async function editMessage(message: Message, content: string): Promise<void> {
  const text = content.trim()
  if (text === message.content) return cancelEdit()
  const res = await requireSocket().emitWithAck('message:edit', { messageId: message.id, content: text })
  if (!res.ok) throw new Error(res.error)
  const editedAt = Date.now()
  applyEdit(message.channelId, message.id, text, (m) => ({ ...m, content: text, editedAt }))
  cancelEdit()
}
