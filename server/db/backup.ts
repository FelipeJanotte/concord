/**
 * Backup do banco PGlite: dump compactado do diretório (`.tar.gz`) com
 * rotação (mantém os N mais novos) e restauração.
 *
 * Com Postgres (DATABASE_URL), o backup é o serviço `pg-backup` do
 * docker-compose (pg_dump diário); este arquivo cuida só do PGlite.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { dumpPglite } from './client'

const PREFIX = 'concord-'
const SUFFIX = '.tar.gz'

/** Nome do arquivo de backup: concord-2026-11-14T15-30-00-000Z.tar.gz (ordena por data). */
export function backupFileName(date = new Date()): string {
  return `${PREFIX}${date.toISOString().replace(/[:.]/g, '-')}${SUFFIX}`
}

/** Backups da pasta, do mais antigo para o mais novo. */
export function listBackups(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX))
    .sort()
}

/** Apaga os mais antigos, mantendo `keep`. Devolve os apagados. */
export function rotateBackups(dir: string, keep: number): string[] {
  const all = listBackups(dir)
  const old = all.slice(0, Math.max(0, all.length - keep))
  for (const f of old) rmSync(join(dir, f), { force: true })
  return old
}

/** Quando foi o backup mais novo (ms), ou null se não há nenhum. */
export function newestBackupTime(dir: string): number | null {
  const newest = listBackups(dir).at(-1)
  return newest ? statSync(join(dir, newest)).mtimeMs : null
}

/** Grava um backup do PGlite aberto e faz a rotação. Devolve o caminho, ou null se o banco não for PGlite. */
export async function backupPglite(dir: string, keep: number, date = new Date()): Promise<string | null> {
  const dump = await dumpPglite()
  if (!dump) return null
  mkdirSync(dir, { recursive: true })
  const file = join(dir, backupFileName(date))
  // grava com outro nome e renomeia: um backup pela metade nunca parece completo
  writeFileSync(`${file}.part`, Buffer.from(await dump.arrayBuffer()))
  renameSync(`${file}.part`, file)
  rotateBackups(dir, keep)
  return file
}

/**
 * Restaura um backup no diretório do PGlite (com o servidor PARADO).
 * O diretório atual, se existir, é guardado como `<dir>.antes-<data>`.
 * Devolve o caminho do diretório guardado (ou null se não havia).
 */
export async function restorePglite(backupFile: string, targetDir: string, date = new Date()): Promise<string | null> {
  if (!existsSync(backupFile)) throw new Error(`Backup não encontrado: ${backupFile}`)
  let saved: string | null = null
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    saved = `${targetDir}.antes-${date.toISOString().replace(/[:.]/g, '-')}`
    renameSync(targetDir, saved)
  }
  const blob = new Blob([readFileSync(backupFile)])
  const pg = new PGlite(targetDir, { loadDataDir: blob })
  try {
    await pg.query('select 1') // garante que abriu e gravou
  } finally {
    await pg.close()
  }
  return saved
}
