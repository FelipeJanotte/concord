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
  /**
   * `migrateUrl`: conexão usada só para aplicar as migrations (dono do schema).
   * Assim o app pode rodar com um usuário sem permissão de alterar tabelas
   * (veja docker/postgres/init/02-app-role.sql). Ausente = usa `url` para tudo.
   */
  | { kind: 'postgres'; url: string; migrateUrl?: string }
  /** `dir` ausente = banco só em memória (testes) */
  | { kind: 'pglite'; dir?: string }

const MIGRATIONS = join(__dirname, 'migrations')

/** `DATABASE_URL` definido → Postgres; senão PGlite em DATA_DIR/pgdata. */
export function databaseConfigFromEnv(): DatabaseConfig {
  const url = process.env.DATABASE_URL?.trim()
  const migrateUrl = process.env.DATABASE_MIGRATE_URL?.trim()
  if (!url) return { kind: 'pglite', dir: PGLITE_DIR }
  return migrateUrl ? { kind: 'postgres', url, migrateUrl } : { kind: 'postgres', url }
}

let current: {
  db: Database
  close: () => Promise<void>
  description: string
  /** presente só no PGlite (backup por dump do diretório) */
  pglite?: PGlite
} | null = null

/** Dump compactado (.tar.gz) do banco PGlite aberto; null se o banco for Postgres. */
export async function dumpPglite(): Promise<Blob | null> {
  if (!current?.pglite) return null
  return current.pglite.dumpDataDir('gzip')
}

export function isPglite(): boolean {
  return !!current?.pglite
}

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
    if (config.migrateUrl) {
      // migrations com o dono do schema; o app usa a conexão com menos privilégio
      const owner = new Pool({ connectionString: config.migrateUrl, max: 1 })
      try {
        await migratePg(drizzlePg(owner, { schema }), { migrationsFolder: MIGRATIONS })
      } finally {
        await owner.end()
      }
    }
    const pool = new Pool({ connectionString: config.url, max: 10 })
    const database = drizzlePg(pool, { schema })
    try {
      if (!config.migrateUrl) await migratePg(database, { migrationsFolder: MIGRATIONS })
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
    description: config.dir ? `PGlite em ${config.dir}` : 'PGlite em memória',
    pglite: client
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
