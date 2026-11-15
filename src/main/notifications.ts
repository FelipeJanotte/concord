/**
 * Notificações nativas e selo no ícone (B9). O renderer decide QUANDO avisar
 * (`src/renderer/src/lib/notifications.ts`); aqui só mostra, traz a janela de volta no clique e
 * desenha o selo: número no macOS/Linux (`app.setBadgeCount`) e imagem por cima do ícone da
 * barra de tarefas no Windows (`setOverlayIcon`), piscando a barra quando o número sobe.
 */
import { app, BrowserWindow, ipcMain, nativeImage, Notification } from 'electron'
import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_TITLE_MAX,
  type NativeNotification,
  type NotificationTarget
} from '../shared/notifications'

/** Confere o que veio do renderer (só texto curto e alvos conhecidos). */
export function cleanNotification(raw: unknown): NativeNotification | null {
  const n = raw as Partial<NativeNotification> | null
  if (!n || typeof n.title !== 'string' || typeof n.body !== 'string' || !n.title.trim()) return null
  const target = cleanTarget(n.target)
  return {
    title: n.title.slice(0, NOTIFICATION_TITLE_MAX),
    body: n.body.slice(0, NOTIFICATION_BODY_MAX),
    ...(target ? { target } : {}),
    silent: n.silent === true
  }
}

function cleanTarget(raw: unknown): NotificationTarget | null {
  const t = raw as Partial<{ kind: string; channelId: unknown }> | null
  if (t?.kind === 'friends') return { kind: 'friends' }
  if (t?.kind === 'dm' && typeof t.channelId === 'string' && t.channelId.length <= 64) return { kind: 'dm', channelId: t.channelId }
  return null
}

/** Número do selo aceito (inteiro de 0 a 999). */
export function cleanBadgeCount(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(999, Math.floor(raw))) : 0
}

/** Notificações vivas: sem referência, o Electron pode descartá-las e o clique se perde. */
const alive = new Set<Notification>()

export function setupNotifications(getWindow: () => BrowserWindow | null): void {
  let lastCount = 0

  ipcMain.on('notify', (_event, raw: unknown) => {
    const n = cleanNotification(raw)
    if (!n || !Notification.isSupported()) return
    const notification = new Notification({ title: n.title, body: n.body, silent: n.silent })
    alive.add(notification)
    notification.on('click', () => {
      const win = getWindow()
      if (win) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        win.webContents.send('notification-click', n.target ?? null)
      }
      alive.delete(notification)
    })
    notification.on('close', () => alive.delete(notification))
    notification.show()
  })

  ipcMain.on('badge', (_event, rawCount: unknown, rawOverlay: unknown) => {
    const count = cleanBadgeCount(rawCount)
    const win = getWindow()
    if (process.platform === 'win32') {
      if (win) {
        const overlay = count > 0 && typeof rawOverlay === 'string' && rawOverlay.startsWith('data:image/png') ? nativeImage.createFromDataURL(rawOverlay) : null
        win.setOverlayIcon(overlay, count > 0 ? `${count} ${count === 1 ? 'aviso' : 'avisos'}` : '')
        // número subiu com a janela em segundo plano: pisca a barra de tarefas (para quando a janela ganha foco)
        if (count > lastCount && !win.isFocused()) {
          win.flashFrame(true)
          win.once('focus', () => win.flashFrame(false))
        }
      }
    } else {
      app.setBadgeCount(count)
    }
    lastCount = count
  })
}
