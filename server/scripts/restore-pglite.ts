/**
 * Restaura um backup do PGlite (DATA_DIR/backups/concord-*.tar.gz).
 *
 *   npm run db:restore -- server/data/backups/concord-2026-11-14T03-00-00-000Z.tar.gz
 *   npm run db:restore            (usa o backup mais novo)
 *
 * PARE o servidor antes. O banco atual é guardado em `pgdata.antes-<data>`.
 * Com Postgres (DATABASE_URL), restaure com psql:
 *   gunzip -c arquivo.sql.gz | psql "$DATABASE_URL"
 */
import '../env'
import { join, resolve } from 'node:path'
import { BACKUP_DIR, PGLITE_DIR } from '../config'
import { listBackups, restorePglite } from '../db/backup'

async function main(): Promise<void> {
  if (process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL está definida: este script é só para o PGlite. Use psql para restaurar no Postgres.')
  }
  const newest = listBackups(BACKUP_DIR).at(-1)
  const file = process.argv[2] ? resolve(process.argv[2]) : newest ? join(BACKUP_DIR, newest) : null
  if (!file) throw new Error(`Nenhum backup em ${BACKUP_DIR}`)
  console.log(`Restaurando ${file} em ${PGLITE_DIR}...`)
  const saved = await restorePglite(file, PGLITE_DIR)
  if (saved) console.log(`Banco anterior guardado em ${saved}`)
  console.log('Pronto. Pode iniciar o servidor.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
