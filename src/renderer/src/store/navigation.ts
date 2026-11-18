export type Section = 'community' | 'home' | 'tool'

export type HomeView = { kind: 'friends' } | { kind: 'dm'; channelId: string }

export interface NavigationState {
  section: Section
  homeView: HomeView
  toolId: string | null
  toolChannelId: string | null
  voiceChatOpen: boolean
}

export const navigationInitial: NavigationState = {
  section: 'community',
  homeView: { kind: 'friends' },
  toolId: null,
  toolChannelId: null,
  voiceChatOpen: false
}
