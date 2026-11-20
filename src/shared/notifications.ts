
export type NotificationTarget = { kind: 'dm'; channelId: string } | { kind: 'channel'; channelId: string } | { kind: 'friends' }

export type NotificationClick = { kind: 'target'; target: NotificationTarget } | { kind: 'no-target' }

export interface NativeNotification {
  title: string
  body: string
  target?: NotificationTarget
  silent?: boolean
}

export const NOTIFICATION_TITLE_MAX = 64
export const NOTIFICATION_BODY_MAX = 200

export interface NotificationsBridge {
  show: (notification: NativeNotification) => void
  setBadge: (count: number, overlay: string | null) => void
  onClick: (listener: (click: NotificationClick) => void) => () => void
}
