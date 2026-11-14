// Canais de texto e voz (as conversas privadas, tipo dm, ficam em repo/dms.ts).
import { and, asc, count, eq, ne, sql } from 'drizzle-orm'
import type { Channel, ChannelKind, ChannelType } from '../../src/shared/types'
import { db, uniqueViolation } from '../db/client'
import { channels } from '../db/schema'
import { DuplicateError, isUuid } from './util'

type Row = typeof channels.$inferSelect

const toChannel = (row: Row): Channel => ({
  id: row.id,
  name: row.name,
  type: row.type as ChannelKind,
  createdAt: row.createdAt.getTime()
})

/** Canais da comunidade (sem as conversas privadas). */
export async function listChannels(): Promise<Channel[]> {
  const rows = await db().select().from(channels).where(ne(channels.type, 'dm')).orderBy(asc(channels.createdAt), asc(channels.id))
  return rows.map(toChannel)
}

export async function findChannel(id: string, type?: ChannelKind): Promise<Channel | undefined> {
  if (!isUuid(id)) return undefined
  const where = type ? and(eq(channels.id, id), eq(channels.type, type)) : eq(channels.id, id)
  const [row] = await db().select().from(channels).where(where).limit(1)
  return row && toChannel(row)
}

/** Quantos canais da comunidade existem (conversas privadas não contam no limite). */
export async function countChannels(): Promise<number> {
  const [row] = await db().select({ n: count() }).from(channels).where(ne(channels.type, 'dm'))
  return Number(row?.n ?? 0)
}

/** Nome repetido no mesmo tipo de canal (sem diferenciar maiúsculas). */
export async function channelNameExists(type: ChannelType, name: string): Promise<boolean> {
  const rows = await db()
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.type, type), sql`lower(${channels.name}) = lower(${name})`))
    .limit(1)
  return rows.length > 0
}

/** Lança `DuplicateError('name')` se já houver canal com o nome no mesmo tipo (garantido pelo banco). */
export async function insertChannel(channel: Channel): Promise<void> {
  try {
    await db()
      .insert(channels)
      .values({ ...channel, createdAt: new Date(channel.createdAt) })
  } catch (err) {
    if (uniqueViolation(err) !== null) throw new DuplicateError('name')
    throw err
  }
}

/**
 * Apaga um canal da comunidade (as mensagens vão junto, por cascade). Devolve false se não existia.
 * Conversas privadas (dm) nunca são apagadas por aqui (nem por quem tem `manageChannels`).
 */
export async function deleteChannel(id: string): Promise<boolean> {
  if (!isUuid(id)) return false
  const rows = await db()
    .delete(channels)
    .where(and(eq(channels.id, id), ne(channels.type, 'dm')))
    .returning({ id: channels.id })
  return rows.length > 0
}
