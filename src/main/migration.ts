import { app, type BrowserWindow } from 'electron'
import { rename, writeFile } from 'fs/promises'
import { join } from 'path'

const KEY_PREFIX = 'concord:'
const MIGRATION_FILE = 'migrate.json'
const READ_LOCAL_STORAGE = 'Object.fromEntries(Object.entries(localStorage))'

export interface MigrationFs {
  writeFile: (path: string, data: string) => Promise<void>
  rename: (from: string, to: string) => Promise<void>
}

export interface ExportDeps {
  fs: MigrationFs
  userDataDir: string
  pairs: unknown
  now: Date
  log: (message: string, error: unknown) => void
}

export function pickConcordEntries(pairs: unknown): Record<string, string> {
  if (typeof pairs !== 'object' || pairs === null) return {}
  const entries = Object.entries(pairs).filter((entry): entry is [string, string] => entry[0].startsWith(KEY_PREFIX) && typeof entry[1] === 'string')
  return Object.fromEntries(entries)
}

export async function exportMigrationFile({ fs, userDataDir, pairs, now, log }: ExportDeps): Promise<void> {
  const target = join(userDataDir, MIGRATION_FILE)
  const temporary = `${target}.tmp`
  const content = JSON.stringify({ version: 1, exportedAt: now.toISOString(), entries: pickConcordEntries(pairs) })
  try {
    await fs.writeFile(temporary, content)
    await fs.rename(temporary, target)
  } catch (err) {
    log('[migração] não exportou as preferências:', err)
  }
}

export function setupMigration(win: BrowserWindow): void {
  win.webContents.on('did-finish-load', () => {
    win.webContents
      .executeJavaScript(READ_LOCAL_STORAGE)
      .then((pairs: unknown) => exportMigrationFile({ fs: { writeFile, rename }, userDataDir: app.getPath('userData'), pairs, now: new Date(), log: console.error }))
      .catch((err: unknown) => console.error('[migração] não leu as preferências:', err))
  })
}
