/**
 * Notificações (B9): liga os eventos às notificações nativas e mantém o selo do ícone em dia.
 * As regras (quando avisar, número do selo) ficam em `lib/notifications.ts`. A ponte com o
 * processo principal (`window.api.notifications`) e o "a janela está em foco?" ficam em
 * `notificationEnv`, que os testes substituem. Fora do Electron (navegador), não faz nada.
 */
import type { NativeNotification, NotificationsBridge, NotificationTarget } from '@shared/notifications'
import { useApp } from '@/store'
import { badgeCount, callNotification, drawBadge, friendRequestNotification, messageNotification } from '../notifications'
import { get, type AppSocket } from '../core'
import { openDmChat, showFriends } from './navigation'

export const notificationEnv = {
  bridge: (): NotificationsBridge | null => (typeof window !== 'undefined' ? (window.api?.notifications ?? null) : null),
  isFocused: (): boolean => typeof document !== 'undefined' && document.hasFocus()
}

function show(n: NativeNotification | null): void {
  if (n) notificationEnv.bridge()?.show(n)
}

/** Clique numa notificação: abre a conversa ou a tela de amigos. */
export function openNotificationTarget(target: NotificationTarget | null): void {
  if (!target) return
  if (target.kind === 'friends') showFriends()
  else if (get().dms.some((d) => d.channel.id === target.channelId)) openDmChat(target.channelId)
}

let lastBadge = -1
/** Manda o número (e a imagem, no Windows) só quando muda. */
export function syncBadge(): void {
  const count = badgeCount(get())
  if (count === lastBadge) return
  lastBadge = count
  notificationEnv.bridge()?.setBadge(count, drawBadge(count))
}

let stopBadge: (() => void) | null = null
let stopClick: (() => void) | null = null

/** Para de acompanhar (sair da conta) e zera o selo. */
export function stopNotifications(): void {
  stopBadge?.()
  stopClick?.()
  stopBadge = stopClick = null
  lastBadge = -1
  notificationEnv.bridge()?.setBadge(0, null)
}

export function bindNotificationEvents(s: AppSocket): void {
  // pedidos que já avisei (o friend:updated também chega quando outra coisa muda na relação)
  const announced = new Set<string>()

  s.on('message:new', (message) => show(messageNotification(message, get(), notificationEnv.isFocused())))
  s.on('call:updated', (call) => show(callNotification(call, get(), notificationEnv.isFocused())))
  s.on('friend:updated', (entry) => {
    if (entry.status !== 'incoming') return void announced.delete(entry.account.id)
    if (announced.has(entry.account.id)) return
    announced.add(entry.account.id)
    show(friendRequestNotification(entry, notificationEnv.isFocused()))
  })

  // selo: recalcula a cada mudança da store (só manda quando o número muda)
  if (!stopBadge) {
    stopBadge = useApp.subscribe(syncBadge)
    syncBadge()
  }
  if (!stopClick) stopClick = notificationEnv.bridge()?.onClick(openNotificationTarget) ?? null
}
