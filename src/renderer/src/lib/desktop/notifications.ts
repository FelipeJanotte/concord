import type { NotificationsBridge, NotificationTarget } from '@shared/notifications'
import { send, subscribe } from './ipc'

export const notificationsBridge: NotificationsBridge = {
  show: (notification) => send('notify', { notification }),
  setBadge: (count, overlay) => send('badge', { count, overlay }),
  onClick: (listener) =>
    subscribe<NotificationTarget | null>('notification-click', (target) =>
      listener(target === null ? { kind: 'no-target' } : { kind: 'target', target })
    )
}
