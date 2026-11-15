// Sobreposição em jogos (overlay, B15). Não é evento do Socket.IO: vai pela ponte do preload.
// A janela principal manda a configuração e o estado da minha sala de voz; o processo principal
// (`src/main/overlay.ts`) posiciona a janela transparente e repassa o estado para a página do overlay.

export const OVERLAY_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
export type OverlayCorner = (typeof OVERLAY_CORNERS)[number]

export const OVERLAY_SIZES = ['small', 'medium', 'large'] as const
export type OverlaySize = (typeof OVERLAY_SIZES)[number]

export interface OverlayConfig {
  enabled: boolean
  corner: OverlayCorner
  size: OverlaySize
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = { enabled: false, corner: 'top-left', size: 'medium' }

/** Atalho global que liga/desliga o overlay (formato de acelerador do Electron). */
export const OVERLAY_SHORTCUT = 'Shift+`'
/** Como o atalho aparece na tela. */
export const OVERLAY_SHORTCUT_LABEL = 'Shift + `'

/** No máximo tantas pessoas aparecem (o resto vira "+N"). */
export const OVERLAY_MAX_MEMBERS = 12

export interface OverlayMember {
  /** conexão (socket.id) */
  id: string
  name: string
  /** endereço completo da foto ou null */
  avatarUrl: string | null
  color: string
  speaking: boolean
  muted: boolean
  deafened: boolean
}

/** O que o overlay mostra: a minha sala de voz (null = fora de sala, o overlay some). */
export interface OverlayRoom {
  channelName: string
  members: OverlayMember[]
  /** quantos ficaram de fora por causa de `OVERLAY_MAX_MEMBERS` */
  more: number
}

/** Ponte da janela principal. */
export interface OverlayBridge {
  setConfig: (config: OverlayConfig) => void
  setRoom: (room: OverlayRoom | null) => void
  /** o atalho global ligou/desligou o overlay (a janela principal salva a preferência) */
  onToggled: (listener: (enabled: boolean) => void) => () => void
}

/** Ponte da página do overlay. */
export interface OverlayViewBridge {
  onUpdate: (listener: (room: OverlayRoom | null, config: OverlayConfig) => void) => () => void
}
