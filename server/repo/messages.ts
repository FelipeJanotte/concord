// Mensagens dos canais de texto.
import type { Message } from '../../src/shared/types'
import { db, save } from '../db'

/** Quantas mensagens ficam guardadas por canal (as mais antigas são descartadas). */
export const MAX_HISTORY = 500

/** Histórico do canal, da mais antiga para a mais nova. */
export async function listMessages(channelId: string): Promise<Message[]> {
  return [...(db.messages[channelId] ?? [])]
}

export async function insertMessage(message: Message): Promise<void> {
  const list = (db.messages[message.channelId] ??= [])
  list.push(message)
  if (list.length > MAX_HISTORY) list.splice(0, list.length - MAX_HISTORY)
  save()
}
