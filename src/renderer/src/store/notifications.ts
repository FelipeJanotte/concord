export type ChannelNotifyMode = 'all' | 'mentions' | 'none'

export type NotificationSoundKind = 'dm' | 'mention' | 'friend'

export const NOTIFICATION_SOUND_KINDS: readonly NotificationSoundKind[] = ['dm', 'mention', 'friend']

export interface NotificationsState {
  channelNotifications: ChannelNotifyMode
  notificationsEnabled: boolean
  notificationSounds: Record<NotificationSoundKind, boolean>
}

export const notificationsInitial: NotificationsState = {
  channelNotifications: 'all',
  notificationsEnabled: true,
  notificationSounds: { dm: true, mention: true, friend: true }
}
