// Sobreposição em jogos (overlay, B15). Não é evento do Socket.IO: vai pela ponte do preload.
// A janela principal manda a configuração e o estado da minha sala de voz; o processo principal
// (`src/main/overlay.ts`) posiciona a janela transparente e repassa o estado para a página do overlay.

export const OVERLAY_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
export type OverlayCorner = (typeof OVERLAY_CORNERS)[number]

export const OVERLAY_SIZES = ['small', 'medium', 'large'] as const
export type OverlaySize = (typeof OVERLAY_SIZES)[number]

/** Posição escolhida arrastando (canto de cima à esquerda, em pixels da tela); null = no canto. */
export interface OverlayPosition {
  x: number
  y: number
}

export interface OverlayConfig {
  enabled: boolean
  corner: OverlayCorner
  size: OverlaySize
  /** arrastada para outro lugar no modo de mover; escolher um canto volta para null */
  position: OverlayPosition | null
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = { enabled: false, corner: 'top-left', size: 'medium', position: null }

/** Atalho global que liga/desliga o overlay (formato de acelerador do Electron). */
export const OVERLAY_SHORTCUT = 'Shift+`'
/** Como o atalho aparece na tela. */
export const OVERLAY_SHORTCUT_LABEL = 'Shift + `'

/** Atalho global que destrava o overlay para arrastar (e trava de novo), como no Discord. */
export const OVERLAY_EDIT_SHORTCUT = 'CommandOrControl+Shift+`'
export const OVERLAY_EDIT_SHORTCUT_LABEL = 'Ctrl + Shift + `'

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
  /** entra/sai do modo de mover (o overlay passa a receber o mouse para ser arrastado) */
  setEditing: (editing: boolean) => void
  /** o modo de mover começou/acabou (pelo botão, pelo atalho, pelo "Concluir" ou Esc) */
  onEditing: (listener: (editing: boolean) => void) => () => void
  /** a pessoa soltou o overlay num lugar novo (a janela principal salva a posição) */
  onMoved: (listener: (position: OverlayPosition) => void) => () => void
}

/** Ponte da página do overlay. */
export interface OverlayViewBridge {
  /** `editing` = modo de mover: mostra a moldura, "Concluir" e (fora de sala) uma prévia */
  onUpdate: (listener: (room: OverlayRoom | null, config: OverlayConfig, editing: boolean) => void) => () => void
  /** "Concluir" ou Esc no modo de mover */
  finishEditing: () => void
}
