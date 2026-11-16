/**
 * Notificações (B9): QUANDO avisar e o número do selo, funções puras sobre a store.
 * Regra: só avisa com a janela fora de foco (com o app na frente, a própria tela já mostra o
 * não lido, a chamada tocando e o selo da Home). Mostrar e desenhar o selo ficam no processo
 * principal (`src/main/notifications.ts`); a ligação com os eventos em `lib/actions/notifications.ts`.
 */
import { mentionsAccount, mentionsToPlain, type CallInfo, type FriendEntry, type Message } from '@shared/types'
import type { NativeNotification } from '@shared/notifications'
import type { AppState } from '@/store'
import type { NotificationSoundKind } from '@/store/notifications'
import { findDm } from './dms'
import { homeBadge } from './home'

type St = Pick<AppState, 'self' | 'dms' | 'friends' | 'unread' | 'calls'> & Partial<Pick<AppState, 'channels' | 'channelNotifications' | 'mutedChannels'>>

/** Texto curto da mensagem para a notificação (anexo sem texto vira "📎 1 anexo"). */
export function messagePreview(message: Message): string {
  // menções (B19) aparecem como "@Nome"
  const plain = mentionsToPlain(message.content, (id) => message.mentions?.find((m) => m.accountId === id)?.name)
  const text = plain.replace(/\s+/g, ' ').trim()
  if (text) return text.length > 120 ? `${text.slice(0, 119)}…` : text
  const n = message.attachments?.length ?? 0
  return n > 0 ? `📎 ${n} ${n === 1 ? 'anexo' : 'anexos'}` : 'Nova mensagem'
}

/**
 * Mensagem nova de outra pessoa, com a janela fora de foco: em conversa privada, sempre; em canal da
 * comunidade, conforme `channelNotifications`: toda mensagem (padrão), só quando me menciona (@eu ou
 * @todos, B19) ou nada. O que não notifica fica só na bolinha de não lido.
 */
export function messageNotification(message: Message, st: St, focused: boolean): NativeNotification | null {
  if (focused || !st.self || message.author.accountId === st.self.accountId || st.mutedChannels?.includes(message.channelId)) return null
  const dm = findDm(st.dms, message.channelId)
  if (dm) return { title: dm.other.name, body: messagePreview(message), target: { kind: 'dm', channelId: dm.channel.id } }
  const mode = st.channelNotifications ?? 'all'
  if (mode === 'none') return null
  if (mode === 'mentions' && !mentionsAccount(message.content, st.self.accountId)) return null
  const channel = st.channels?.find((c) => c.id === message.channelId)
  return {
    // chat da sala de voz: o nome sem "#" (como aparece na barra lateral)
    title: channel ? `${message.author.name} em ${channel.type === 'voice' ? channel.name : `#${channel.name}`}` : message.author.name,
    body: messagePreview(message),
    target: { kind: 'channel', channelId: message.channelId }
  }
}

/** Alguém está me ligando (chamada tocando para mim), com a janela fora de foco. */
export function callNotification(call: CallInfo, st: St, focused: boolean): NativeNotification | null {
  if (focused || !st.self || call.status !== 'ringing' || call.calleeId !== st.self.accountId) return null
  const dm = findDm(st.dms, call.channelId)
  const name = dm?.other.name ?? 'Alguém'
  // sem som do sistema: o app já toca o toque da chamada
  return { title: `${name} está ligando`, body: 'Chamada de voz. Clique para abrir a conversa.', target: { kind: 'dm', channelId: call.channelId }, silent: true }
}

/** Pedido de amizade recebido, com a janela fora de foco. */
export function friendRequestNotification(entry: FriendEntry, focused: boolean): NativeNotification | null {
  if (focused || entry.status !== 'incoming') return null
  return {
    title: 'Pedido de amizade',
    body: `${entry.account.name}#${entry.account.tag} enviou um pedido de amizade.`,
    target: { kind: 'friends' }
  }
}

type SoundSt = Pick<AppState, 'self' | 'dms' | 'mutedChannels' | 'deafened' | 'notificationSounds'>

export function messageSound(message: Message, st: SoundSt, seen: boolean): NotificationSoundKind | null {
  if (seen || st.deafened || !st.self || message.author.accountId === st.self.accountId || st.mutedChannels.includes(message.channelId)) return null
  const kind: NotificationSoundKind | null = findDm(st.dms, message.channelId) ? 'dm' : mentionsAccount(message.content, st.self.accountId) ? 'mention' : null
  return kind && st.notificationSounds[kind] ? kind : null
}

export function friendRequestSound(entry: FriendEntry, st: Pick<SoundSt, 'deafened' | 'notificationSounds'>): NotificationSoundKind | null {
  return entry.status === 'incoming' && !st.deafened && st.notificationSounds.friend ? 'friend' : null
}

/** Número do selo: o mesmo da Home (pedidos + conversas não lidas) + chamadas tocando para mim. */
export function badgeCount(st: St): number {
  const me = st.self?.accountId
  const ringing = Object.values(st.calls).filter((c) => c.status === 'ringing' && c.calleeId === me).length
  return homeBadge(st.friends, st.dms, st.unread) + ringing
}

/** Selo do Windows: bolinha vermelha com o número (data URL PNG), ou null se o canvas não existir. */
export function drawBadge(count: number): string | null {
  if (count <= 0 || typeof document === 'undefined') return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 32
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--destructive').trim() || 'red'
    ctx.beginPath()
    ctx.arc(16, 16, 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'white'
    ctx.font = `bold ${count > 9 ? 16 : 20}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(count > 99 ? '99+' : String(count), 16, 17)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}
