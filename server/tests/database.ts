/**
 * Banco isolado para testes.
 *
 * - Com `DATABASE_URL_TEST` (docker compose, ver concord-dev-workflow): cria um
 *   banco Postgres temporário só para aquele teste e apaga no fim.
 * - Sem ela: PGlite (em memória para testes do repo, ou no DATA_DIR do servidor).
 */
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { closeDatabase, openDatabase } from '../db/client'

export interface TestDatabase {
  /** URL para passar como DATABASE_URL, ou null quando o teste usa PGlite */
  url: string | null
  drop: () => Promise<void>
}

/** Cria um banco Postgres vazio e temporário (ou devolve `url: null` se não houver DATABASE_URL_TEST). */
export async function createTestDatabase(): Promise<TestDatabase> {
  const base = process.env.DATABASE_URL_TEST?.trim()
  if (!base) return { url: null, drop: async () => {} }

  const name = `concord_t_${randomBytes(5).toString('hex')}`
  const admin = new Client({ connectionString: base })
  await admin.connect()
  try {
    await admin.query(`CREATE DATABASE "${name}"`)
  } finally {
    await admin.end()
  }
  const url = new URL(base)
  url.pathname = `/${name}`
  return {
    url: url.toString(),
    drop: async () => {
      const c = new Client({ connectionString: base })
      await c.connect()
      try {
        await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
      } finally {
        await c.end()
      }
    }
  }
}

/** Abre um banco vazio, já migrado, neste processo (testes do repo). Devolve a limpeza. */
export async function openTestDatabase(): Promise<() => Promise<void>> {
  const test = await createTestDatabase()
  await openDatabase(test.url ? { kind: 'postgres', url: test.url } : { kind: 'pglite' })
  return async () => {
    await closeDatabase()
    await test.drop()
  }
}
