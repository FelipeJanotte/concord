/**
 * Enquetes (v4): a enquete é a mensagem `kind: 'tool'` com `tool.tool = 'poll'`; os votos ficam em
 * `poll_votes`. Cada voto recalcula as contagens e grava em `messages.tool`, então o histórico já vem
 * com o resultado atual. A linha da mensagem é travada (`for update`) para dois votos ao mesmo tempo
 * não se sobrescreverem.
 */
import { and, countDistinct, eq, inArray, sql } from 'drizzle-orm'
import { pollResultText, type PollResult, type ToolPayload } from '../../src/shared/types'
import { db } from '../db/client'
import { messages, pollVotes } from '../db/schema'
import { isUuid } from './util'

export interface PollMessage {
  messageId: string
  channelId: string
  authorId: string | null
  result: PollResult
}

const pollOf = (tool: ToolPayload | null): PollResult | undefined => (tool?.tool === 'poll' ? tool.result : undefined)

/** A enquete da mensagem (ou undefined se não existe ou não é enquete). */
export async function findPoll(messageId: string): Promise<PollMessage | undefined> {
  if (!isUuid(messageId)) return undefined
  const [row] = await db()
    .select({ id: messages.id, channelId: messages.channelId, authorId: messages.authorId, tool: messages.tool })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.kind, 'tool')))
    .limit(1)
  const result = row && pollOf(row.tool)
  return result && { messageId: row.id, channelId: row.channelId, authorId: row.authorId, result }
}

/**
 * Substitui os votos da conta na enquete (`choices` vazio = tira o voto) e devolve o resultado novo.
 * Não confere regras (aberta, voto único, índices): isso é do módulo. Devolve undefined se a enquete sumiu.
 */
export async function setVote(messageId: string, accountId: string, choices: number[]): Promise<PollResult | undefined> {
  if (!isUuid(messageId) || !isUuid(accountId)) return undefined
  return db().transaction(async (tx) => {
    const [row] = await tx.select({ tool: messages.tool }).from(messages).where(eq(messages.id, messageId)).for('update')
    const poll = row && pollOf(row.tool)
    if (!poll) return undefined
    await tx.delete(pollVotes).where(and(eq(pollVotes.messageId, messageId), eq(pollVotes.accountId, accountId)))
    if (choices.length > 0) await tx.insert(pollVotes).values(choices.map((choice) => ({ messageId, accountId, choice })))

    const counts = poll.options.map(() => 0)
    const rows = await tx
      .select({ choice: pollVotes.choice, n: sql<number>`count(*)` })
      .from(pollVotes)
      .where(eq(pollVotes.messageId, messageId))
      .groupBy(pollVotes.choice)
    for (const r of rows) if (r.choice < counts.length) counts[r.choice] = Number(r.n)
    const [v] = await tx.select({ n: countDistinct(pollVotes.accountId) }).from(pollVotes).where(eq(pollVotes.messageId, messageId))

    const result: PollResult = { ...poll, counts, voters: Number(v?.n ?? 0) }
    await tx.update(messages).set({ tool: { tool: 'poll', result }, content: pollResultText(result) }).where(eq(messages.id, messageId))
    return result
  })
}

/** Encerra a enquete (ninguém mais vota). Devolve o resultado, ou undefined se sumiu. */
export async function closePoll(messageId: string): Promise<PollResult | undefined> {
  if (!isUuid(messageId)) return undefined
  return db().transaction(async (tx) => {
    const [row] = await tx.select({ tool: messages.tool }).from(messages).where(eq(messages.id, messageId)).for('update')
    const poll = row && pollOf(row.tool)
    if (!poll) return undefined
    const result: PollResult = { ...poll, closed: true }
    await tx.update(messages).set({ tool: { tool: 'poll', result }, content: pollResultText(result) }).where(eq(messages.id, messageId))
    return result
  })
}

/** Os votos da conta nessas mensagens (só as que têm voto aparecem). */
export async function votesOf(accountId: string, messageIds: string[]): Promise<Record<string, number[]>> {
  const ids = messageIds.filter(isUuid)
  if (!isUuid(accountId) || ids.length === 0) return {}
  const rows = await db()
    .select({ messageId: pollVotes.messageId, choice: pollVotes.choice })
    .from(pollVotes)
    .where(and(eq(pollVotes.accountId, accountId), inArray(pollVotes.messageId, ids)))
  const out: Record<string, number[]> = {}
  for (const r of rows) (out[r.messageId] ??= []).push(r.choice)
  for (const list of Object.values(out)) list.sort((a, b) => a - b)
  return out
}

/** Canal de cada mensagem (para conferir quem pode ver antes de responder `poll:mine`). */
export async function channelsOfMessages(messageIds: string[]): Promise<Map<string, string>> {
  const ids = messageIds.filter(isUuid)
  if (ids.length === 0) return new Map()
  const rows = await db().select({ id: messages.id, channelId: messages.channelId }).from(messages).where(inArray(messages.id, ids))
  return new Map(rows.map((r) => [r.id, r.channelId]))
}
