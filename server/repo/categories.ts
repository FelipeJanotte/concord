import { randomUUID } from 'node:crypto'
import { asc, count, eq, max } from 'drizzle-orm'
import type { ChannelCategory, ChannelPlacement } from '../../src/shared/types'
import { db } from '../db/client'
import { channelCategories, channels } from '../db/schema'
import { isUuid } from './util'

type Row = typeof channelCategories.$inferSelect

const toCategory = (row: Row): ChannelCategory => ({ id: row.id, name: row.name, position: row.position })

export async function listCategories(): Promise<ChannelCategory[]> {
  const rows = await db().select().from(channelCategories).orderBy(asc(channelCategories.position), asc(channelCategories.createdAt))
  return rows.map(toCategory)
}

export async function findCategory(id: string): Promise<ChannelCategory | undefined> {
  if (!isUuid(id)) return undefined
  const [row] = await db().select().from(channelCategories).where(eq(channelCategories.id, id)).limit(1)
  return row && toCategory(row)
}

export async function countCategories(): Promise<number> {
  const [row] = await db().select({ n: count() }).from(channelCategories)
  return Number(row?.n ?? 0)
}

export async function insertCategory(name: string): Promise<ChannelCategory> {
  const [last] = await db().select({ position: max(channelCategories.position) }).from(channelCategories)
  const [row] = await db()
    .insert(channelCategories)
    .values({ id: randomUUID(), name, position: (last?.position ?? -1) + 1 })
    .returning()
  return toCategory(row!)
}

export async function renameCategory(id: string, name: string): Promise<ChannelCategory | undefined> {
  if (!isUuid(id)) return undefined
  const [row] = await db().update(channelCategories).set({ name }).where(eq(channelCategories.id, id)).returning()
  return row && toCategory(row)
}

export async function deleteCategory(id: string): Promise<boolean> {
  if (!isUuid(id)) return false
  const rows = await db().delete(channelCategories).where(eq(channelCategories.id, id)).returning({ id: channelCategories.id })
  return rows.length > 0
}

export async function saveLayout(categoryIds: string[], placements: ChannelPlacement[]): Promise<void> {
  await db().transaction(async (tx) => {
    for (const [position, id] of categoryIds.entries()) {
      await tx.update(channelCategories).set({ position }).where(eq(channelCategories.id, id))
    }
    for (const [position, { id, categoryId }] of placements.entries()) {
      await tx.update(channels).set({ position, categoryId }).where(eq(channels.id, id))
    }
  })
}
