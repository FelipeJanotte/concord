// Notificações nativas e selo no ícone (B9). Não é evento do Socket.IO: vai pela ponte
// `window.api.notifications` (preload) até o processo principal (`src/main/notifications.ts`).

/** O que abrir quando a pessoa clica na notificação. */
export type NotificationTarget = { kind: 'dm'; channelId: string } | { kind: 'friends' }

export interface NativeNotification {
  title: string
  body: string
  /** o que abrir ao clicar (sem = só traz a janela para frente) */
  target?: NotificationTarget
  /** sem o som do sistema (ex.: a chamada já toca o próprio toque) */
  silent?: boolean
}

export const NOTIFICATION_TITLE_MAX = 64
export const NOTIFICATION_BODY_MAX = 200

export interface NotificationsBridge {
  /** mostra a notificação do sistema */
  show: (notification: NativeNotification) => void
  /**
   * selo no ícone: o número (0 = tira) e, no Windows, a imagem do selo (data URL PNG) que vai
   * por cima do ícone da barra de tarefas (o Windows não tem número de selo próprio)
   */
  setBadge: (count: number, overlay: string | null) => void
  /** clique numa notificação; devolve a função que para de ouvir */
  onClick: (listener: (target: NotificationTarget | null) => void) => () => void
}
