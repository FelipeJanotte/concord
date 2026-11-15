// Notificações (B9): preferência desta máquina sobre mensagens de canal (salva no localStorage).

/** O que notificar das mensagens de canal da comunidade (conversas privadas sempre notificam). */
export type ChannelNotifyMode = 'all' | 'mentions' | 'none'

export interface NotificationsState {
  /** 'all' = toda mensagem; 'mentions' = só quando me mencionam (@eu ou @todos); 'none' = nada */
  channelNotifications: ChannelNotifyMode
}

export const notificationsInitial: NotificationsState = {
  channelNotifications: 'all'
}
