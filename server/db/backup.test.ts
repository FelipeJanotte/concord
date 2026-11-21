// Backup e restauração do PGlite (num diretório temporário de verdade).
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findChannel, insertChannel } from '../repo/channels'
import {
  backupFileName,
  backupPglite,
  listBackups,
  newestBackupTime,
  restorePglite,
  rotateBackups
} from './backup'
import { closeDatabase, databaseConfigFromEnv, openDatabase } from './client'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'concord-backup-'))
})

afterEach(async () => {
  await closeDatabase()
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

describe('nomes, lista e rotação', () => {
  it('nome ordena pela data e não tem ":" (vale no Windows)', () => {
    const a = backupFileName(new Date('2026-01-02T03:04:05.006Z'))
    expect(a).toBe('concord-2026-01-02T03-04-05-006Z.tar.gz')
    expect(backupFileName(new Date('2026-01-03T00:00:00Z')) > a).toBe(true)
  })

  it('lista só backups, do mais antigo ao mais novo; rotação mantém os N mais novos', () => {
    const backups = join(dir, 'b')
    mkdirSync(backups)
    const names = [1, 2, 3, 4].map((d) => backupFileName(new Date(`2026-01-0${d}T00:00:00Z`)))
    for (const n of [...names].reverse()) writeFileSync(join(backups, n), 'x')
    writeFileSync(join(backups, 'anotacoes.txt'), 'não é backup')
    expect(listBackups(backups)).toEqual(names)
    expect(rotateBackups(backups, 2)).toEqual(names.slice(0, 2))
    expect(listBackups(backups)).toEqual(names.slice(2))
    expect(existsSync(join(backups, 'anotacoes.txt'))).toBe(true)
  })

  it('newestBackupTime: null sem backups; senão o horário do mais novo', () => {
    expect(newestBackupTime(join(dir, 'nao-existe'))).toBeNull()
    const file = join(dir, backupFileName())
    writeFileSync(file, 'x')
    const when = new Date('2026-05-01T12:00:00Z')
    utimesSync(file, when, when)
    expect(newestBackupTime(dir)).toBe(when.getTime())
  })
})

// Abrir um PGlite em disco (com todas as migrations), fazer dump e restaurar é pesado: sozinho leva
// poucos segundos, mas com a suíte inteira em paralelo passa dos 15 s padrão. Não é lentidão do backup.
describe('backup e restauração', { timeout: 60_000 }, () => {
  it('sem banco aberto (ou Postgres) não faz backup', async () => {
    expect(await backupPglite(join(dir, 'b'), 7)).toBeNull()
  })

  it('o backup restaura os mesmos dados, guardando o banco anterior', async () => {
    const pgdata = join(dir, 'pgdata')
    const backups = join(dir, 'backups')
    await openDatabase({ kind: 'pglite', dir: pgdata })
    const channel = { id: randomUUID(), name: 'salvo-no-backup', type: 'text' as const, createdAt: Date.now() }
    const placed = await insertChannel(channel)
    const file = await backupPglite(backups, 7)
    expect(file && existsSync(file)).toBe(true)
    expect(readdirSync(backups).some((f) => f.endsWith('.part'))).toBe(false)

    // depois do backup, mais um canal que NÃO deve voltar
    await insertChannel({ id: randomUUID(), name: 'depois', type: 'text', createdAt: Date.now() })
    await closeDatabase()

    const saved = await restorePglite(file!, pgdata, new Date('2026-11-14T10:00:00Z'))
    expect(saved).toBe(`${pgdata}.antes-2026-11-14T10-00-00-000Z`)
    expect(existsSync(saved!)).toBe(true)

    await openDatabase({ kind: 'pglite', dir: pgdata })
    expect(await findChannel(channel.id)).toEqual(placed)
    const names = (await (await import('../repo/channels')).listChannels()).map((c) => c.name)
    expect(names).toContain('salvo-no-backup')
    expect(names).not.toContain('depois')
  })

  it('restaurar num diretório vazio não guarda nada', async () => {
    await openDatabase({ kind: 'pglite' })
    const file = await backupPglite(join(dir, 'b'), 7)
    await closeDatabase()
    expect(await restorePglite(file!, join(dir, 'novo'))).toBeNull()
    const pg = new PGlite(join(dir, 'novo'))
    const { rows } = await pg.query<{ n: number }>('select count(*)::int as n from channels')
    await pg.close()
    expect(rows[0].n).toBe(0) // banco vazio, mas com as tabelas (migrations vieram junto)
  })

  it('backup inexistente dá erro claro', async () => {
    await expect(restorePglite(join(dir, 'nada.tar.gz'), join(dir, 'x'))).rejects.toThrow('Backup não encontrado')
  })

  it('rotação acontece a cada backup', async () => {
    await openDatabase({ kind: 'pglite' })
    const backups = join(dir, 'b')
    for (let d = 1; d <= 4; d++) await backupPglite(backups, 2, new Date(`2026-01-0${d}T00:00:00Z`))
    expect(listBackups(backups)).toEqual([
      backupFileName(new Date('2026-01-03T00:00:00Z')),
      backupFileName(new Date('2026-01-04T00:00:00Z'))
    ])
  })
})

describe('databaseConfigFromEnv', () => {
  it('sem DATABASE_URL: PGlite', () => {
    vi.stubEnv('DATABASE_URL', '')
    expect(databaseConfigFromEnv()).toMatchObject({ kind: 'pglite' })
  })

  it('com DATABASE_URL: Postgres; com DATABASE_MIGRATE_URL, migrations com o dono', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://concord_app:x@h/db')
    vi.stubEnv('DATABASE_MIGRATE_URL', '')
    expect(databaseConfigFromEnv()).toEqual({ kind: 'postgres', url: 'postgres://concord_app:x@h/db' })
    vi.stubEnv('DATABASE_MIGRATE_URL', 'postgres://concord:y@h/db')
    expect(databaseConfigFromEnv()).toEqual({
      kind: 'postgres',
      url: 'postgres://concord_app:x@h/db',
      migrateUrl: 'postgres://concord:y@h/db'
    })
  })
})
