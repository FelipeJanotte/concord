import type { Channel, ChannelCategory, ChannelLayout, ChannelPlacement, ChannelsLayoutUpdate } from '@shared/types'

export interface CategoryGroup {
  category: ChannelCategory
  channels: Channel[]
}

export interface GroupedChannels {
  uncategorized: Channel[]
  groups: CategoryGroup[]
}

export interface ChannelDropTarget {
  categoryId: string | null
  beforeId: string | null
}

const byPosition = (a: Channel, b: Channel): number =>
  (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || a.createdAt - b.createdAt || a.id.localeCompare(b.id)

export function groupChannels(channels: Channel[], categories: ChannelCategory[]): GroupedChannels {
  const known = new Set(categories.map((c) => c.id))
  const sorted = [...channels].sort(byPosition)
  const inCategory = (categoryId: string | null): Channel[] =>
    sorted.filter((c) => (c.categoryId && known.has(c.categoryId) ? c.categoryId : null) === categoryId)
  return {
    uncategorized: inCategory(null),
    groups: [...categories].sort((a, b) => a.position - b.position).map((category) => ({ category, channels: inCategory(category.id) }))
  }
}

export function layoutOf({ uncategorized, groups }: GroupedChannels): ChannelLayout {
  return {
    categories: groups.map((g) => g.category.id),
    channels: [
      ...uncategorized.map((c) => ({ id: c.id, categoryId: null })),
      ...groups.flatMap((g) => g.channels.map((c) => ({ id: c.id, categoryId: g.category.id })))
    ]
  }
}

function flatten(categories: string[], channels: ChannelPlacement[]): ChannelLayout {
  const order = [null, ...categories]
  return { categories, channels: order.flatMap((categoryId) => channels.filter((c) => c.categoryId === categoryId)) }
}

export function moveChannel(layout: ChannelLayout, channelId: string, target: ChannelDropTarget): ChannelLayout {
  if (target.beforeId === channelId) return layout
  const rest = layout.channels.filter((c) => c.id !== channelId)
  const moved = { id: channelId, categoryId: target.categoryId }
  const before = rest.findIndex((c) => c.id === target.beforeId)
  const lastOfCategory = rest.reduce((last, c, i) => (c.categoryId === target.categoryId ? i : last), -1)
  const at = before >= 0 ? before : lastOfCategory >= 0 ? lastOfCategory + 1 : rest.length
  return flatten(layout.categories, [...rest.slice(0, at), moved, ...rest.slice(at)])
}

export function moveCategory(layout: ChannelLayout, categoryId: string, beforeId: string | null): ChannelLayout {
  if (beforeId === categoryId) return layout
  const rest = layout.categories.filter((id) => id !== categoryId)
  const before = beforeId === null ? -1 : rest.indexOf(beforeId)
  const at = before >= 0 ? before : rest.length
  return flatten([...rest.slice(0, at), categoryId, ...rest.slice(at)], layout.channels)
}

export function layoutUpdate(layout: ChannelLayout, categories: ChannelCategory[]): ChannelsLayoutUpdate {
  return {
    categories: layout.categories.flatMap((id, position) => {
      const category = categories.find((c) => c.id === id)
      return category ? [{ ...category, position }] : []
    }),
    channels: layout.channels.map((c, position) => ({ ...c, position }))
  }
}

export function applyLayoutUpdate(channels: Channel[], update: ChannelsLayoutUpdate): Channel[] {
  const placed = new Map(update.channels.map((c) => [c.id, c]))
  return channels.map((c) => {
    const p = placed.get(c.id)
    return p ? { ...c, position: p.position, categoryId: p.categoryId } : c
  })
}
