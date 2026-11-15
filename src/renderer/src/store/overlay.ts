// Sobreposição em jogos (overlay, B15): preferência desta máquina (salva em `concord:overlay`).
import { DEFAULT_OVERLAY_CONFIG, type OverlayCorner, type OverlayPosition, type OverlaySize } from '@shared/overlay'

export interface OverlayState {
  overlayEnabled: boolean
  overlayCorner: OverlayCorner
  overlaySize: OverlaySize
  /** posição arrastada no modo de mover; null = no canto escolhido */
  overlayPosition: OverlayPosition | null
  /** modo de mover ligado agora (não é salvo) */
  overlayEditing: boolean
}

export const overlayInitial: OverlayState = {
  overlayEnabled: DEFAULT_OVERLAY_CONFIG.enabled,
  overlayCorner: DEFAULT_OVERLAY_CONFIG.corner,
  overlaySize: DEFAULT_OVERLAY_CONFIG.size,
  overlayPosition: DEFAULT_OVERLAY_CONFIG.position,
  overlayEditing: false
}
