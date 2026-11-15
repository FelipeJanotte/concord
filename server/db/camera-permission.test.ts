// B21: a migration 0009 dá a câmera (`video`) a quem já podia compartilhar a tela nas comunidades existentes.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(join(__dirname, 'migrations', '0009_camera_permission.sql'), 'utf8')

describe('migration 0009_camera_permission', () => {
  it('acrescenta video em cargo com share, sem duplicar e sem mexer nos outros', async () => {
    const db = new PGlite()
    await db.exec(`CREATE TABLE "roles" ("id" text PRIMARY KEY, "permissions" text[] NOT NULL DEFAULT '{}')`)
    await db.exec(`INSERT INTO "roles" VALUES
      ('todos', '{view,send,attach,connect,speak,share}'),
      ('ja-tinha', '{connect,share,video}'),
      ('sem-tela', '{view,send}')`)
    await db.exec(sql)
    await db.exec(sql) // rodar de novo não duplica
    const { rows } = await db.query<{ id: string; permissions: string[] }>(`SELECT * FROM "roles" ORDER BY "id"`)
    expect(Object.fromEntries(rows.map((r) => [r.id, r.permissions]))).toEqual({
      'ja-tinha': ['connect', 'share', 'video'],
      'sem-tela': ['view', 'send'],
      todos: ['view', 'send', 'attach', 'connect', 'speak', 'share', 'video']
    })
    await db.close()
  })
})
