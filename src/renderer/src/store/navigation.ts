// Navegação (B7): que parte do app está aberta na barra de úteis (Comunidade, Home ou uma ferramenta).
// A tela da comunidade continua em `view` (store/channels.ts): trocar de seção não a perde.

/** Seção escolhida na barra de úteis (a barra da esquerda). */
export type Section = 'community' | 'home' | 'tool'

/** O que a Home mostra: a tela "Amigos" ou uma conversa privada. */
export type HomeView = { kind: 'friends' } | { kind: 'dm'; channelId: string }

export interface NavigationState {
  section: Section
  homeView: HomeView
  /** ferramenta aberta (id do registro `components/tools/registry.ts`) quando `section` é 'tool' */
  toolId: string | null
  /** painel "Chat" da sala de voz aberto (vale para a sala em `view`; fica aberto ao trocar de sala) */
  voiceChatOpen: boolean
}

export const navigationInitial: NavigationState = {
  section: 'community',
  homeView: { kind: 'friends' },
  toolId: null,
  voiceChatOpen: false
}
