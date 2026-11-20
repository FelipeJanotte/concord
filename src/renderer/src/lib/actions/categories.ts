import type { Channel, ChannelCategory, ChannelLayout, ChannelsLayoutUpdate, OkResult } from '@shared/types'
import { applyLayoutUpdate, layoutUpdate } from '../channel-layout'
import { get, requireSocket, set, type AppSocket } from '../core'

function applyUpdate(update: ChannelsLayoutUpdate): void {
  set((st) => ({ categories: update.categories, channels: applyLayoutUpdate(st.channels, update) }))
}

export function bindCategoryEvents(s: AppSocket): void {
  s.on('channels:layout', applyUpdate)
}

function unwrap(res: OkResult): void {
  if (!res.ok) throw new Error(res.error)
}

function restorePositions(channels: Channel[], categories: ChannelCategory[]): void {
  const oldPosition = new Map(categories.map((c) => [c.id, c.position]))
  set((st) => ({
    categories: st.categories.map((c) => ({ ...c, position: oldPosition.get(c.id) ?? c.position })),
    channels: applyLayoutUpdate(
      st.channels,
      { categories: [], channels: channels.map((c) => ({ id: c.id, categoryId: c.categoryId ?? null, position: c.position ?? 0 })) }
    )
  }))
}

export async function saveChannelLayout(layout: ChannelLayout): Promise<void> {
  const { channels, categories } = get()
  applyUpdate(layoutUpdate(layout, categories))
  const res = await requireSocket().emitWithAck('channel:layout', layout)
  if (!res.ok) restorePositions(channels, categories)
  unwrap(res)
}

export async function createCategory(name: string): Promise<ChannelCategory> {
  const res = await requireSocket().emitWithAck('category:create', { name })
  if (!res.ok) throw new Error(res.error)
  return res.category
}

export async function renameCategory(categoryId: string, name: string): Promise<ChannelCategory> {
  const res = await requireSocket().emitWithAck('category:rename', { categoryId, name })
  if (!res.ok) throw new Error(res.error)
  return res.category
}

export async function deleteCategory(categoryId: string): Promise<void> {
  unwrap(await requireSocket().emitWithAck('category:delete', { categoryId }))
}
