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

export interface MigrationWindow {
  onFinishLoad: (fn: () => void) => void
  onClose: (fn: (event: { preventDefault: () => void }) => void) => void
  readLocalStorage: () => Promise<unknown>
  close: () => void
}

export interface MigrationDeps {
  window: MigrationWindow
  fs: MigrationFs
  userDataDir: string
  now: () => Date
  log: (message: string, error: unknown) => void
  closeTimeoutMs?: number
}

export function watchMigration({ window, fs, userDataDir, now, log, closeTimeoutMs = 2000 }: MigrationDeps): void {
  let finalExportStarted = false

  async function exportNow(): Promise<void> {
    try {
      const pairs = await window.readLocalStorage()
      await exportMigrationFile({ fs, userDataDir, pairs, now: now(), log })
    } catch (err) {
      log('[migração] não leu as preferências:', err)
    }
  }

  function timeout(): { expired: Promise<void>; cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | undefined
    const expired = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, closeTimeoutMs)
    })
    return { expired, cancel: () => clearTimeout(timer) }
  }

  window.onFinishLoad(() => void exportNow())
  window.onClose((event) => {
    if (finalExportStarted) return
    finalExportStarted = true
    event.preventDefault()
    const limit = timeout()
    void Promise.race([exportNow(), limit.expired]).finally(() => {
      limit.cancel()
      window.close()
    })
  })
}

export function setupMigration(win: BrowserWindow): void {
  watchMigration({
    window: {
      onFinishLoad: (fn) => win.webContents.on('did-finish-load', fn),
      onClose: (fn) => win.on('close', fn),
      readLocalStorage: () => win.webContents.executeJavaScript(READ_LOCAL_STORAGE),
      close: () => win.close()
    },
    fs: { writeFile, rename },
    userDataDir: app.getPath('userData'),
    now: () => new Date(),
    log: console.error
  })
}
