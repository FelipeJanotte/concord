/**
 * Backup automático do PGlite (dados em DATA_DIR/pgdata) em DATA_DIR/backups.
 * Faz um backup quando o mais novo tiver mais de BACKUP_INTERVAL_MS (padrão
 * 24 h) e mantém os BACKUP_KEEP mais novos (padrão 7). Reiniciar o servidor
 * não gera backup extra. Com Postgres, quem faz o backup é o serviço
 * `pg-backup` do docker-compose.
 */
import { BACKUP_DIR, BACKUP_INTERVAL_MS, BACKUP_KEEP } from '../config'
import type { ServerModule } from '../context'
import { backupPglite, newestBackupTime } from '../db/backup'
import { isPglite } from '../db/client'

let running = false

/** Faz o backup se já passou o intervalo desde o último. Devolve o arquivo criado ou null. */
export async function backupIfDue(now = Date.now()): Promise<string | null> {
  if (running || !isPglite()) return null
  const newest = newestBackupTime(BACKUP_DIR)
  if (newest !== null && now - newest < BACKUP_INTERVAL_MS) return null
  running = true
  try {
    return await backupPglite(BACKUP_DIR, BACKUP_KEEP, new Date(now))
  } finally {
    running = false
  }
}

export const backupModule: ServerModule = {
  init() {
    if (!isPglite()) return
    const check = (): void => {
      backupIfDue().then(
        (file) => file && console.log(`[backup] ${file}`),
        (err) => console.error('[backup] falhou:', err)
      )
    }
    check()
    setInterval(check, Math.min(BACKUP_INTERVAL_MS, 60 * 60 * 1000)).unref()
  }
}
