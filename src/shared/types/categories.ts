import type { OkResult } from './permissions'

export const CATEGORY_NAME_MAX_LENGTH = 32
export const MAX_CATEGORIES = 50

export interface ChannelCategory {
  id: string
  name: string
  position: number
}

export interface ChannelPlacement {
  id: string
  categoryId: string | null
}

export interface ChannelLayout {
  categories: string[]
  channels: ChannelPlacement[]
}

export interface ChannelsLayoutUpdate {
  categories: ChannelCategory[]
  channels: (ChannelPlacement & { position: number })[]
}

export type CategoryResult = { ok: true; category: ChannelCategory } | { ok: false; error: string }

export function normalizeCategoryName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, CATEGORY_NAME_MAX_LENGTH)
  return name || null
}

const sameSet = (list: string[], expected: string[]): boolean =>
  list.length === expected.length && new Set(list).size === list.length && list.every((id) => expected.includes(id))

const isPlacement = (value: unknown): value is ChannelPlacement => {
  const p = value as ChannelPlacement | null
  return typeof p?.id === 'string' && (p.categoryId === null || typeof p.categoryId === 'string')
}

export function parseLayout(raw: unknown, expected: { categoryIds: string[]; channelIds: string[] }): ChannelLayout | null {
  const layout = raw as Partial<ChannelLayout> | null
  if (!Array.isArray(layout?.categories) || !Array.isArray(layout.channels)) return null
  if (!layout.categories.every((id) => typeof id === 'string') || !layout.channels.every(isPlacement)) return null
  const categories = layout.categories
  const channels = layout.channels.map(({ id, categoryId }) => ({ id, categoryId }))
  if (!sameSet(categories, expected.categoryIds)) return null
  if (!sameSet(channels.map((c) => c.id), expected.channelIds)) return null
  if (!channels.every((c) => c.categoryId === null || categories.includes(c.categoryId))) return null
  return { categories, channels }
}

export interface CategoriesServerEvents {
  'channels:layout': (update: ChannelsLayoutUpdate) => void
}

export interface CategoriesClientEvents {
  'category:create': (payload: { name: string }, ack: (res: CategoryResult) => void) => void
  'category:rename': (payload: { categoryId: string; name: string }, ack: (res: CategoryResult) => void) => void
  'category:delete': (payload: { categoryId: string }, ack: (res: OkResult) => void) => void
  'channel:layout': (layout: ChannelLayout, ack: (res: OkResult) => void) => void
}
