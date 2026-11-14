// Efeitos sonoros (A10): registro no banco (os bytes ficam no storage de sons).
import { asc, count, eq } from 'drizzle-orm'
import type { Sound, SoundType } from '../../src/shared/types'
import { db, uniqueViolation } from '../db/client'
import { sounds } from '../db/schema'
import { DuplicateError, isUuid } from './util'

type Row = typeof sounds.$inferSelect

export interface StoredSound {
  sound: Sound
  contentType: SoundType
  size: number
}

/** `url` é o caminho sem assinatura; quem envia ao app assina por conta. */
const toStored = (row: Row): StoredSound => ({
  sound: {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    durationMs: row.durationMs,
    uploaderId: row.uploaderId,
    url: `/sounds/${row.id}`
  },
  contentType: row.contentType as SoundType,
  size: row.size
})

export interface NewSound {
  id: string
  name: string
  emoji: string | null
  uploaderId: string
  contentType: SoundType
  size: number
  durationMs: number
}

/** Lança `DuplicateError('name')` se já existir um som com o nome (sem diferenciar maiúsculas). */
export async function insertSound(s: NewSound): Promise<StoredSound> {
  try {
    const [row] = await db().insert(sounds).values(s).returning()
    return toStored(row)
  } catch (err) {
    if (uniqueViolation(err) !== null) throw new DuplicateError('name')
    throw err
  }
}

export async function listSounds(): Promise<StoredSound[]> {
  const rows = await db().select().from(sounds).orderBy(asc(sounds.createdAt), asc(sounds.name))
  return rows.map(toStored)
}

export async function findSound(id: string): Promise<StoredSound | undefined> {
  if (!isUuid(id)) return undefined
  const [row] = await db().select().from(sounds).where(eq(sounds.id, id)).limit(1)
  return row && toStored(row)
}

export async function deleteSound(id: string): Promise<boolean> {
  if (!isUuid(id)) return false
  const rows = await db().delete(sounds).where(eq(sounds.id, id)).returning({ id: sounds.id })
  return rows.length > 0
}

/** Total de sons e, se `uploaderId` vier, quantos são dessa conta. */
export async function countSounds(uploaderId?: string): Promise<number> {
  const [row] = uploaderId
    ? await db().select({ n: count() }).from(sounds).where(eq(sounds.uploaderId, uploaderId))
    : await db().select({ n: count() }).from(sounds)
  return Number(row?.n ?? 0)
}
