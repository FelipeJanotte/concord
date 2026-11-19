import type { Message } from '@shared/types'

export interface SearchView {
  text: string
  channelId: string | null
  query: string
  authorId?: string
  results: Message[]
  hasMore: boolean
  loading: boolean
  error: string | null
}

export interface SearchState {
  search: SearchView | null
}

export const searchInitial: SearchState = {
  search: null
}
