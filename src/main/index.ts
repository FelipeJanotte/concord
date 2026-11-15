import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { googleSignIn } from './google-auth'
import { setupNotifications } from './notifications'
import { setupOverlay, teardownOverlay, type OverlayController } from './overlay'
import { setupPushToTalk, type PushToTalkController } from './push-to-talk'
import { setupScreenShare } from './screen-share'

/** A janela principal (as notificações trazem ela de volta no clique; o overlay manda o aviso do atalho). */
let mainWindow: BrowserWindow | null = null
let overlay: OverlayController | null = null
let pushToTalk: PushToTalkController | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    show: false,
    title: 'Concord',
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
    // o overlay é uma janela também: sem destruir, o app não fecharia
    overlay?.destroy()
  })
  win.on('ready-to-show', () => win.show())

  // Links externos abrem no navegador padrão.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.concord.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Libera o microfone para os canais de voz.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'notifications')
  })

  ipcMain.handle('google-sign-in', (_event, clientId: unknown) => {
    if (typeof clientId !== 'string' || !clientId) throw new Error('Login com Google não configurado')
    return googleSignIn(clientId)
  })

  setupScreenShare()
  overlay = setupOverlay(() => mainWindow)
  setupNotifications(() => mainWindow)
  pushToTalk = setupPushToTalk(() => mainWindow)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  teardownOverlay()
  pushToTalk?.destroy()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
