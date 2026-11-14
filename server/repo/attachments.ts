// Anexos: registro no banco (os bytes ficam no storage).
import { and, asc, eq, inArray, isNull, lt } from 'drizzle-orm'
import type { Attachment } from '../../src/shared/types'
import { db } from '../db/client'
import { attachments, messages } from '../db/schema'
import { isUuid } from './util'

type Row = typeof attachments.$inferSelect

export function toAttachment(row: Pick<Row, 'id' | 'name' | 'size' | 'contentType' | 'width' | 'height'>): Attachment {
  return {
    id: row.id,
    name: row.name,
    size: row.size,
    contentType: row.contentType,
    url: `/files/${row.id}/${encodeURIComponent(row.name)}`,
    width: row.width,
    height: row.height
  }
}

export interface NewAttachment {
  id: string
  uploaderId: string
  name: string
  contentType: string
  size: number
  width: number | null
  height: number | null
}

/** Registra um anexo recém-enviado (ainda fora de qualquer mensagem). */
export async function insertAttachment(a: NewAttachment): Promise<Attachment> {
  const [row] = await db().insert(attachments).values(a).returning()
  return toAttachment(row)
}

/** Anexo que já está numa mensagem (só esses podem ser baixados). */
export async function findPublishedAttachment(id: string): Promise<Attachment | undefined> {
  if (!isUuid(id)) return undefined
  const [row] = await db().select().from(attachments).where(eq(attachments.id, id)).limit(1)
  return row && row.messageId ? toAttachment(row) : undefined
}

/** Anexos das mensagens, agrupados por mensagem e na ordem de envio. */
export async function attachmentsByMessage(messageIds: string[]): Promise<Map<string, Attachment[]>> {
  const map = new Map<string, Attachment[]>()
  if (messageIds.length === 0) return map
  const rows = await db()
    .select()
    .from(attachments)
    .where(inArray(attachments.messageId, messageIds))
    .orderBy(asc(attachments.position))
  for (const row of rows) {
    const list = map.get(row.messageId!) ?? []
    list.push(toAttachment(row))
    map.set(row.messageId!, list)
  }
  return map
}

/** Ids dos arquivos das mensagens de um canal (para apagar do storage junto com o canal). */
export async function attachmentIdsInChannel(channelId: string): Promise<string[]> {
  if (!isUuid(channelId)) return []
  const rows = await db()
    .select({ id: attachments.id })
    .from(attachments)
    .innerJoin(messages, eq(messages.id, attachments.messageId))
    .where(eq(messages.channelId, channelId))
  return rows.map((r) => r.id)
}

/** Apaga os anexos que não entraram em mensagem nenhuma até `olderThan`. Devolve os ids apagados. */
export async function deleteStaleUnattached(olderThan: Date): Promise<string[]> {
  const rows = await db()
    .delete(attachments)
    .where(and(isNull(attachments.messageId), lt(attachments.createdAt, olderThan)))
    .returning({ id: attachments.id })
  return rows.map((r) => r.id)
}

/** Dos ids informados, quais existem no banco. */
export async function existingAttachmentIds(ids: string[]): Promise<Set<string>> {
  const valid = ids.filter((id) => isUuid(id))
  const found = new Set<string>()
  for (let i = 0; i < valid.length; i += 500) {
    const rows = await db()
      .select({ id: attachments.id })
      .from(attachments)
      .where(inArray(attachments.id, valid.slice(i, i + 500)))
    for (const r of rows) found.add(r.id)
  }
  return found
}
