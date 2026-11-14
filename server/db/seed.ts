/**
 * Dados iniciais e importação do banco JSON antigo (`DATA_DIR/db.json`).
 *
 * Ao iniciar com o banco vazio: se existir um db.json das versões anteriores,
 * importa tudo (contas, sessões, canais, mensagens); senão, cria os canais padrão.
 * A importação é idempotente (o que já existe é ignorado) e também roda pelo
 * script `npm run db:import-json`.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { count } from 'drizzle-orm'
import { MESSAGE_MAX_LENGTH, type ChannelType } from '../../src/shared/types'
import { LEGACY_JSON_FILE } from '../config'
import { isUuid } from '../repo/util'
import { db } from './client'
import { accounts, channels, messages, sessions } from './schema'

export const DEFAULT_CHANNELS: { name: string; type: ChannelType }[] = [
  { name: 'geral', type: 'text' },
  { name: 'off-topic', type: 'text' },
  { name: 'Sala de Voz', type: 'voice' },
  { name: 'Jogos', type: 'voice' }
]

/** Formato do db.json antigo (campos opcionais vieram em versões diferentes). */
interface LegacyDb {
  channels?: { id: string; name: string; type: string; createdAt?: number }[]
  messages?: Record<
    string,
    {
      id: string
      channelId?: string
      content: string
      createdAt?: number
      author: { id: string; accountId?: string; name: string; tag?: string; color?: string }
    }[]
  >
  accounts?: {
    id: string
    email: string
    name: string
    tag: string
    tagLocked?: boolean
    color: string
    passwordHash: string | null
    googleId: string | null
    avatarType: string | null
    avatarVersion?: number
    createdAt?: number
  }[]
  sessions?: { tokenHash: string; accountId: string; expiresAt: number }[]
}

export interface ImportResult {
  accounts: number
  sessions: number
  channels: number
  messages: number
}

const CHUNK = 500

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK))
  return out
}

/** Importa um db.json antigo. O que já existe no banco (mesmo id, e-mail, id#tag...) é ignorado. */
export async function importLegacyJson(file: string): Promise<ImportResult> {
  const data = JSON.parse(readFileSync(file, 'utf8')) as LegacyDb
  const now = Date.now()
  const result: ImportResult = { accounts: 0, sessions: 0, channels: 0, messages: 0 }

  await db().transaction(async (tx) => {
    const accountRows = (data.accounts ?? [])
      .filter((a) => isUuid(a.id) && a.email && a.name && a.tag)
      .map((a) => ({
        id: a.id,
        email: a.email.toLowerCase(),
        name: a.name,
        tag: a.tag,
        tagLocked: a.tagLocked ?? true,
        color: a.color,
        passwordHash: a.passwordHash ?? null,
        googleId: a.googleId ?? null,
        avatarType: a.avatarType ?? null,
        avatarVersion: a.avatarVersion ?? 0,
        createdAt: new Date(a.createdAt ?? now)
      }))
    for (const part of chunks(accountRows)) {
      const inserted = await tx.insert(accounts).values(part).onConflictDoNothing().returning({ id: accounts.id })
      result.accounts += inserted.length
    }
    const knownAccounts = new Set((await tx.select({ id: accounts.id }).from(accounts)).map((r) => r.id))

    const sessionRows = (data.sessions ?? [])
      .filter((s) => s.expiresAt > now && knownAccounts.has(s.accountId))
      .map((s) => ({ tokenHash: s.tokenHash, accountId: s.accountId, expiresAt: new Date(s.expiresAt) }))
    for (const part of chunks(sessionRows)) {
      const inserted = await tx.insert(sessions).values(part).onConflictDoNothing().returning({ t: sessions.tokenHash })
      result.sessions += inserted.length
    }

    const channelRows = (data.channels ?? [])
      .filter((c) => isUuid(c.id) && (c.type === 'text' || c.type === 'voice'))
      .map((c, i) => ({ id: c.id, name: String(c.name).slice(0, 32), type: c.type, createdAt: new Date(c.createdAt ?? now + i) }))
      .filter((c) => c.name.trim().length > 0)
    for (const part of chunks(channelRows)) {
      const inserted = await tx.insert(channels).values(part).onConflictDoNothing().returning({ id: channels.id })
      result.channels += inserted.length
    }
    const textChannels = new Set(
      (await tx.select({ id: channels.id, type: channels.type }).from(channels))
        .filter((c) => c.type === 'text')
        .map((c) => c.id)
    )

    for (const [channelId, list] of Object.entries(data.messages ?? {})) {
      if (!textChannels.has(channelId)) continue
      const rows = list
        .map((m) => {
          const authorAccount = m.author.accountId ?? m.author.id
          const content = String(m.content ?? '').trim().slice(0, MESSAGE_MAX_LENGTH)
          return {
            id: isUuid(m.id) ? m.id : randomUUID(),
            channelId,
            authorId: knownAccounts.has(authorAccount) ? authorAccount : null,
            authorName: m.author.name || 'Desconhecido',
            authorTag: m.author.tag ?? '',
            authorColor: m.author.color ?? '#5865f2',
            content,
            createdAt: new Date(m.createdAt ?? now)
          }
        })
        .filter((m) => m.content.length > 0)
      // Em ordem: o `seq` gerado preserva a ordem original do canal.
      for (const part of chunks(rows)) {
        const inserted = await tx.insert(messages).values(part).onConflictDoNothing().returning({ id: messages.id })
        result.messages += inserted.length
      }
    }
  })

  return result
}

/** Banco vazio: importa o db.json antigo, se houver; senão cria os canais padrão. Devolve o que fez (para o log). */
export async function ensureInitialData(legacyFile = LEGACY_JSON_FILE): Promise<string | null> {
  const [a] = await db().select({ n: count() }).from(accounts)
  const [c] = await db().select({ n: count() }).from(channels)
  if (Number(a?.n) > 0 || Number(c?.n) > 0) return null

  if (existsSync(legacyFile)) {
    const r = await importLegacyJson(legacyFile)
    return `importado de ${legacyFile}: ${r.accounts} contas, ${r.sessions} sessões, ${r.channels} canais, ${r.messages} mensagens`
  }

  const now = Date.now()
  await db()
    .insert(channels)
    .values(DEFAULT_CHANNELS.map((ch, i) => ({ id: randomUUID(), ...ch, createdAt: new Date(now + i) })))
    .onConflictDoNothing()
  return `canais padrão criados (${DEFAULT_CHANNELS.map((c) => c.name).join(', ')})`
}
