// Sobreposição em jogos (overlay, B15): preferência desta máquina (salva em `concord:overlay`).
import { DEFAULT_OVERLAY_CONFIG, type OverlayCorner, type OverlaySize } from '@shared/overlay'

export interface OverlayState {
  overlayEnabled: boolean
  overlayCorner: OverlayCorner
  overlaySize: OverlaySize
}

export const overlayInitial: OverlayState = {
  overlayEnabled: DEFAULT_OVERLAY_CONFIG.enabled,
  overlayCorner: DEFAULT_OVERLAY_CONFIG.corner,
  overlaySize: DEFAULT_OVERLAY_CONFIG.size
}
