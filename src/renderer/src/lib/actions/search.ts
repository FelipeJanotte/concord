import type { SearchRequest } from '@shared/types'
import type { AppState } from '@/store'
import type { SearchView } from '@/store/search'
import { omit } from '../utils'
import { get, notify, requireSocket, set } from '../core'
import { findDm } from '../dms'
import { findAuthor, parseSearchInput, type Person } from '../search'
import { loadHistoryAround } from './messages'

let lastRequest = 0

function knownPeople(st: AppState): Person[] {
  const online = [...(st.self ? [st.self] : []), ...st.users]
  const accounts = [...st.dms.map((d) => d.other), ...st.friends.map((f) => f.account)]
  return [...online, ...accounts.map((a) => ({ accountId: a.id, name: a.name, tag: a.tag }))]
}

function requestOf(view: SearchView, before?: string): SearchRequest {
  return {
    query: view.query,
    ...(view.authorId ? { authorId: view.authorId } : {}),
    ...(view.channelId ? { channelId: view.channelId } : {}),
    ...(before ? { before } : {})
  }
}

async function fetchResults(view: SearchView, before?: string): Promise<void> {
  const request = ++lastRequest
  set({ search: { ...view, loading: true, error: null } })
  let next: Partial<SearchView>
  try {
    const res = await requireSocket().emitWithAck('message:search', requestOf(view, before))
    next = res.ok ? { results: [...view.results, ...res.messages], hasMore: res.hasMore } : { error: res.error }
  } catch {
    next = { error: 'Não foi possível buscar' }
  }
  if (request !== lastRequest || !get().search) return
  set({ search: { ...view, ...next, loading: false } })
}

export async function searchMessages(text: string, channelId: string | null): Promise<void> {
  const { query, authorName } = parseSearchInput(text)
  const authorId = authorName ? findAuthor(authorName, knownPeople(get())) : undefined
  const view: SearchView = { text, channelId, query, authorId, results: [], hasMore: false, loading: false, error: null }
  if (authorName && !authorId) return set({ search: { ...view, error: `Ninguém chamado "${authorName}"` } })
  if (!query && !authorId) return set({ search: { ...view, error: 'Digite o que buscar' } })
  await fetchResults(view)
}

export async function loadMoreResults(): Promise<void> {
  const view = get().search
  const last = view?.results.at(-1)
  if (!view || !last || !view.hasMore || view.loading) return
  await fetchResults(view, last.id)
}

export function closeSearch(): void {
  lastRequest++
  set({ search: null })
}

function showChat(channelId: string): void {
  const st = get()
  const unread = omit(st.unread, channelId)
  if (findDm(st.dms, channelId)) return set({ section: 'home', homeView: { kind: 'dm', channelId }, unread })
  const channel = st.channels.find((c) => c.id === channelId)
  if (channel?.type === 'voice') return set({ section: 'community', view: { kind: 'voice', channelId }, voiceChatOpen: true, unread })
  set({ section: 'community', view: { kind: 'text', channelId }, unread })
}

export async function jumpToMessage(channelId: string, messageId: string): Promise<void> {
  showChat(channelId)
  if (get().messages[channelId]?.some((m) => m.id === messageId)) return set({ jumpTarget: { channelId, messageId } })
  set({ jumpTarget: null })
  try {
    if (await loadHistoryAround(channelId, messageId)) return set({ jumpTarget: { channelId, messageId } })
    notify('Mensagem não encontrada')
  } catch {
    notify('Não foi possível abrir a mensagem')
  }
}
