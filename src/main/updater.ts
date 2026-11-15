/**
 * Atualização automática (A13): o electron-updater procura versão nova nos GitHub Releases
 * (`publish` no electron-builder.yml) ao abrir e a cada `UPDATE_CHECK_INTERVAL_MS`, baixa em
 * segundo plano e avisa a janela; "Reiniciar para atualizar" (faixa no topo ou botão na barra de úteis)
 * chama `quitAndInstall(true, true)`: instala **em silêncio** e abre o app de novo (sem isso o instalador
 * assistido, `oneClick: false`, abria o assistente inteiro). Se a pessoa não reiniciar, a versão baixada
 * entra sozinha da próxima vez que o app fechar.
 *
 * Em modo dev (app não empacotado) não faz nada: o electron-updater só funciona no instalado.
 * `createUpdaterController` tem a lógica, testável com um atualizador falso.
 */
import { app, ipcMain, type BrowserWindow } from 'electron'
import { UPDATE_CHECK_INTERVAL_MS, type UpdateStatus } from '../shared/updater'

/** O pedaço do `autoUpdater` (electron-updater) que usamos. */
export interface UpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: 'checking-for-update', fn: () => void): unknown
  on(event: 'update-available', fn: (info: { version: string }) => void): unknown
  on(event: 'update-not-available', fn: () => void): unknown
  on(event: 'download-progress', fn: (p: { percent: number }) => void): unknown
  on(event: 'update-downloaded', fn: (info: { version: string }) => void): unknown
  on(event: 'error', fn: (err: Error) => void): unknown
  checkForUpdates(): Promise<unknown>
  /** `isSilent`: sem o assistente do instalador; `isForceRunAfter`: abre o app depois de instalar */
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export interface UpdaterDeps {
  updater: UpdaterLike
  /** app instalado (no dev não atualiza) */
  isPackaged: boolean
  /** manda a situação para a janela */
  send: (status: UpdateStatus) => void
  setInterval?: (fn: () => void, ms: number) => unknown
  log?: (message: string) => void
}

export function createUpdaterController({ updater, isPackaged, send, setInterval: every = setInterval, log = console.warn }: UpdaterDeps) {
  let status: UpdateStatus = { state: 'idle' }
  let pendingVersion = ''

  function set(next: UpdateStatus): void {
    // depois de baixada, só um reinício muda: não volta para "procurando"
    if (status.state === 'ready' && next.state !== 'ready') return
    status = next
    send(status)
  }

  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  updater.on('checking-for-update', () => set({ state: 'checking' }))
  updater.on('update-available', (info) => {
    pendingVersion = info.version
    set({ state: 'downloading', version: info.version, percent: 0 })
  })
  updater.on('update-not-available', () => set({ state: 'idle' }))
  updater.on('download-progress', (p) => set({ state: 'downloading', version: pendingVersion, percent: Math.max(0, Math.min(100, Math.round(p.percent))) }))
  updater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }))
  updater.on('error', (err) => {
    log(`[atualização] ${err.message}`)
    set({ state: 'error', message: 'Não foi possível procurar atualizações agora.' })
  })

  function check(): void {
    if (!isPackaged) return
    updater.checkForUpdates().catch((err: unknown) => log(`[atualização] ${err instanceof Error ? err.message : String(err)}`))
  }

  return {
    /** primeira verificação e as seguintes, de tempos em tempos */
    start(): void {
      if (!isPackaged) return
      check()
      every(check, UPDATE_CHECK_INTERVAL_MS)
    },
    status: (): UpdateStatus => status,
    /** reinicia e instala; só faz algo com a versão já baixada */
    install(): void {
      if (status.state === 'ready') updater.quitAndInstall(true, true)
    }
  }
}

/**
 * O `autoUpdater` do módulo importado. O electron-updater é CommonJS: no `import()` do main (ESM) o
 * `autoUpdater` não vira export nomeado (é um getter) e só existe em `default`. Sem isso ele chegava
 * `undefined` e a atualização nem ligava ("Cannot set properties of undefined (setting 'autoDownload')").
 */
export function pickAutoUpdater(mod: unknown): UpdaterLike {
  const m = mod as { autoUpdater?: unknown; default?: { autoUpdater?: unknown } } | null
  const updater = m?.autoUpdater ?? m?.default?.autoUpdater
  if (!updater) throw new Error('electron-updater sem autoUpdater')
  return updater as UpdaterLike
}

/** Liga ao Electron (IPC `update-get`/`update-install`, aviso `update-status`). */
export async function setupUpdater(getWindow: () => BrowserWindow | null): Promise<void> {
  // import dinâmico: o electron-updater só é carregado no app de verdade (não nos testes)
  const controller = createUpdaterController({
    updater: pickAutoUpdater(await import('electron-updater')),
    isPackaged: app.isPackaged,
    send: (status) => getWindow()?.webContents.send('update-status', status)
  })
  ipcMain.handle('update-get', () => controller.status())
  ipcMain.on('update-install', () => controller.install())
  controller.start()
}
