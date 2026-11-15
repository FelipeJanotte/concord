// Navegação (B7): trocar de seção na barra de úteis, abrir "Amigos", uma conversa privada ou uma ferramenta.
import { omit } from '../utils'
import { get, set } from '../core'
import { openDm } from './friends'
import { loadHistory } from './messages'

/** Abre o chat e limpa o não lido dele (o histórico vem só na primeira vez). */
function openChat(channelId: string): void {
  set((st) => ({ unread: omit(st.unread, channelId) }))
  void loadHistory(channelId)
}

/** Volta para a comunidade, na mesma tela de antes (canal de texto ou sala de voz). */
export function showCommunity(): void {
  set({ section: 'community', toolId: null })
  const view = get().view
  if (view?.kind === 'text') openChat(view.channelId)
}

/** Vai para a Home, na última coisa aberta nela ("Amigos" ou uma conversa). */
export function showHome(): void {
  set({ section: 'home', toolId: null })
  const home = get().homeView
  if (home.kind === 'dm') openChat(home.channelId)
}

/** Tela "Amigos" (abas Online, Todos, Pendentes, Bloqueados e Adicionar). */
export function showFriends(): void {
  set({ section: 'home', homeView: { kind: 'friends' }, toolId: null })
}

/** Abre uma conversa que já está na lista (`dms`). */
export function openDmChat(channelId: string): void {
  set({ section: 'home', homeView: { kind: 'dm', channelId }, toolId: null })
  openChat(channelId)
}

/**
 * "Mensagem" (botão direito numa pessoa, tela Amigos): abre ou cria a conversa com a conta
 * e mostra o chat. Lança `Error` com a mensagem do servidor (ex.: "Vocês precisam ser amigos").
 */
export async function messageAccount(accountId: string): Promise<void> {
  const dm = await openDm(accountId)
  openDmChat(dm.channel.id)
}

/** Abre o painel de uma ferramenta da barra de úteis (o canal ou a sala atual continuam como contexto). */
export function openTool(toolId: string): void {
  set({ section: 'tool', toolId })
}

/** O chat deste canal está na tela agora? (para não marcar como não lido) */
export function isChatOnScreen(st: ReturnType<typeof get>, channelId: string): boolean {
  if (st.section === 'community') return st.view?.kind === 'text' && st.view.channelId === channelId
  if (st.section === 'home') return st.homeView.kind === 'dm' && st.homeView.channelId === channelId
  return false
}
