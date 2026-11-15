/**
 * Notificações (B9): QUANDO avisar e o número do selo, funções puras sobre a store.
 * Regra: só avisa com a janela fora de foco (com o app na frente, a própria tela já mostra o
 * não lido, a chamada tocando e o selo da Home). Mostrar e desenhar o selo ficam no processo
 * principal (`src/main/notifications.ts`); a ligação com os eventos em `lib/actions/notifications.ts`.
 */
import type { CallInfo, FriendEntry, Message } from '@shared/types'
import type { NativeNotification } from '@shared/notifications'
import type { AppState } from '@/store'
import { findDm } from './dms'
import { homeBadge } from './home'

type St = Pick<AppState, 'self' | 'dms' | 'friends' | 'unread' | 'calls'>

/** Texto curto da mensagem para a notificação (anexo sem texto vira "📎 1 anexo"). */
export function messagePreview(message: Message): string {
  const text = message.content.replace(/\s+/g, ' ').trim()
  if (text) return text.length > 120 ? `${text.slice(0, 119)}…` : text
  const n = message.attachments?.length ?? 0
  return n > 0 ? `📎 ${n} ${n === 1 ? 'anexo' : 'anexos'}` : 'Nova mensagem'
}

/** Mensagem nova numa conversa privada, de outra pessoa, com a janela fora de foco. */
export function messageNotification(message: Message, st: St, focused: boolean): NativeNotification | null {
  if (focused || !st.self || message.author.accountId === st.self.accountId) return null
  const dm = findDm(st.dms, message.channelId)
  if (!dm) return null // canais da comunidade não notificam (só a bolinha de não lido)
  return { title: dm.other.name, body: messagePreview(message), target: { kind: 'dm', channelId: dm.channel.id } }
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
