/**
 * Conexão com o banco.
 *
 * - Com `DATABASE_URL`: PostgreSQL de verdade (docker compose, produção) via `pg`.
 * - Sem `DATABASE_URL`: PGlite (o próprio Postgres em WebAssembly, rodando dentro do
 *   Node) com os dados em DATA_DIR/pgdata. Zero instalação para quem só quer rodar.
 *
 * Os dois usam o mesmo schema (`./schema`) e as mesmas migrations (`./migrations`),
 * aplicadas automaticamente ao abrir.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { Pool } from 'pg'
import { PGLITE_DIR } from '../config'
import * as schema from './schema'

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>

export type DatabaseConfig =
  | { kind: 'postgres'; url: string }
  /** `dir` ausente = banco só em memória (testes) */
  | { kind: 'pglite'; dir?: string }

const MIGRATIONS = join(__dirname, 'migrations')

/** `DATABASE_URL` definido → Postgres; senão PGlite em DATA_DIR/pgdata. */
export function databaseConfigFromEnv(): DatabaseConfig {
  const url = process.env.DATABASE_URL?.trim()
  return url ? { kind: 'postgres', url } : { kind: 'pglite', dir: PGLITE_DIR }
}

let current: { db: Database; close: () => Promise<void>; description: string } | null = null

/** O banco aberto. Lança erro se `openDatabase` ainda não rodou. */
export function db(): Database {
  if (!current) throw new Error('Banco não foi aberto (chame openDatabase antes)')
  return current.db
}

/** Texto para o log de inicialização (sem senha). */
export function describeDatabase(): string {
  return current?.description ?? 'fechado'
}

/** Abre a conexão e aplica as migrations pendentes. */
export async function openDatabase(config: DatabaseConfig): Promise<void> {
  if (current) await closeDatabase()

  if (config.kind === 'postgres') {
    const pool = new Pool({ connectionString: config.url, max: 10 })
    const database = drizzlePg(pool, { schema })
    try {
      await migratePg(database, { migrationsFolder: MIGRATIONS })
    } catch (err) {
      await pool.end()
      throw err
    }
    const url = new URL(config.url)
    current = {
      db: database as unknown as Database,
      close: () => pool.end(),
      description: `PostgreSQL ${url.hostname}:${url.port || 5432}${url.pathname}`
    }
    return
  }

  if (config.dir) mkdirSync(config.dir, { recursive: true })
  const client = config.dir ? new PGlite(config.dir) : new PGlite()
  const database = drizzlePglite(client, { schema })
  try {
    await migratePglite(database, { migrationsFolder: MIGRATIONS })
  } catch (err) {
    await client.close()
    throw err
  }
  current = {
    db: database as unknown as Database,
    close: () => client.close(),
    description: config.dir ? `PGlite em ${config.dir}` : 'PGlite em memória'
  }
}

export async function closeDatabase(): Promise<void> {
  const open = current
  current = null
  await open?.close()
}

/**
 * Se o erro for violação de unicidade (código 23505), devolve o nome da
 * constraint (ex.: `accounts_email_key`); senão, null.
 */
export function uniqueViolation(err: unknown): string | null {
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const { code, constraint } = e as { code?: unknown; constraint?: unknown }
    if (code === '23505') return typeof constraint === 'string' ? constraint : ''
  }
  return null
}
