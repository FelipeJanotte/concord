/**
 * Persistência simples em JSON (canais, mensagens, contas e sessões).
 * Para produção, trocar por SQLite ou Postgres.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Channel, ChannelType, Message } from '../src/shared/types'

export const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, 'data')
export const AVATAR_DIR = join(DATA_DIR, 'avatars')
const DB_FILE = join(DATA_DIR, 'db.json')

export interface Account {
  id: string
  /** sempre em minúsculas */
  email: string
  name: string
  /** id escolhido pela pessoa: único (sem diferenciar maiúsculas) e imutável depois de travado */
  tag: string
  /** false só em contas do Google que ainda não escolheram o id definitivo */
  tagLocked: boolean
  color: string
  /** `scrypt$<salt>$<hash>` ou null para contas só com Google */
  passwordHash: string | null
  /** `sub` do Google, quando vinculada */
  googleId: string | null
  /** content-type da foto salva em AVATAR_DIR/<id>, ou null sem foto */
  avatarType: string | null
  avatarVersion: number
  createdAt: number
}

export interface Session {
  /** sha256 do token (o token em si nunca é salvo) */
  tokenHash: string
  accountId: string
  expiresAt: number
}

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
