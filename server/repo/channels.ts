// Canais de texto e voz.
import type { Channel, ChannelType } from '../../src/shared/types'
import { db, save } from '../db'

export async function listChannels(): Promise<Channel[]> {
  return db.channels.map((c) => ({ ...c }))
}

export async function findChannel(id: string, type?: ChannelType): Promise<Channel | undefined> {
  const channel = db.channels.find((c) => c.id === id && (!type || c.type === type))
  return channel ? { ...channel } : undefined
}

export async function countChannels(): Promise<number> {
  return db.channels.length
}

/** Nome repetido no mesmo tipo de canal (sem diferenciar maiúsculas). */
export async function channelNameExists(type: ChannelType, name: string): Promise<boolean> {
  const n = name.toLowerCase()
  return db.channels.some((c) => c.type === type && c.name.toLowerCase() === n)
}

export async function insertChannel(channel: Channel): Promise<void> {
  db.channels.push({ ...channel })
  save()
}

/** Apaga o canal e as mensagens dele. Devolve false se o canal não existia. */
export async function deleteChannel(id: string): Promise<boolean> {
  const index = db.channels.findIndex((c) => c.id === id)
  if (index < 0) return false
  db.channels.splice(index, 1)
  delete db.messages[id]
  save()
  return true
}
