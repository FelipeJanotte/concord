/**
 * Persistência simples em JSON (canais, mensagens, contas e sessões).
 *
 * Só `server/repo/*` deve importar `db` e `save`. O resto do servidor fala com
 * o repo, então a troca por Postgres (roadmap v1/A1) substitui este arquivo
 * sem mexer nos módulos.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Channel, ChannelType, Message } from '../src/shared/types'
import type { Account, Session } from './repo/types'

export const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, 'data')
export const AVATAR_DIR = join(DATA_DIR, 'avatars')
const DB_FILE = join(DATA_DIR, 'db.json')

export interface Db {
  channels: Channel[]
  messages: Record<string, Message[]>
  accounts: Account[]
  sessions: Session[]
}

function defaultDb(): Db {
  const now = Date.now()
  const ch = (name: string, type: ChannelType): Channel => ({ id: randomUUID(), name, type, createdAt: now })
  return {
    channels: [ch('geral', 'text'), ch('off-topic', 'text'), ch('Sala de Voz', 'voice'), ch('Jogos', 'voice')],
    messages: {},
    accounts: [],
    sessions: []
  }
}

function loadDb(): Db {
  try {
    if (existsSync(DB_FILE)) {
      const data = JSON.parse(readFileSync(DB_FILE, 'utf8')) as Partial<Db>
      const db: Db = { ...defaultDb(), ...data }
      db.accounts ??= []
      db.sessions ??= []
      for (const a of db.accounts) a.tagLocked ??= true
      // Mensagens antigas (de antes das contas) não têm accountId/tag/foto.
      for (const list of Object.values(db.messages)) {
        for (const m of list) {
          m.author.accountId ??= m.author.id
          m.author.tag ??= ''
          m.author.avatarUrl ??= null
        }
      }
      return db
    }
  } catch (err) {
    console.warn('[db] não foi possível ler o banco, começando do zero:', err)
  }
  return defaultDb()
}

export const db = loadDb()

let saveTimer: NodeJS.Timeout | null = null
export function save(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(DB_FILE, JSON.stringify(db))
  }, 500)
}
