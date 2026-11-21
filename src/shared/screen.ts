// Compartilhamento de tela: o que o processo principal do Electron mostra no seletor.
// (Não é evento do Socket.IO; vai pela ponte `window.api.screen`.)

export interface ScreenSource {
  /** id do desktopCapturer (ex.: `screen:0:0`, `window:1234:0`) */
  id: string
  name: string
  kind: 'screen' | 'window'
  /** miniatura em data URL (PNG) */
  thumbnail: string
  /** ícone do programa (só janelas), data URL ou null */
  appIcon: string | null
}

export interface ScreenShareBridge {
  /** telas e janelas disponíveis agora */
  getSources: () => Promise<ScreenSource[]>
  /** escolhe a fonte do próximo `getDisplayMedia` (chamado pelo LiveKit ao publicar a tela) */
  select: (sourceId: string, audio: boolean) => Promise<void>
  /** o sistema permite capturar o áudio junto (hoje só no Windows) */
  canShareAudio: boolean
}

export const SCREEN_RESOLUTIONS = ['720p', '1080p', '1440p', 'original'] as const
export const SCREEN_FPS = [15, 30, 60] as const

export type ScreenResolution = (typeof SCREEN_RESOLUTIONS)[number]
export type ScreenFps = (typeof SCREEN_FPS)[number]

export interface ScreenQuality {
  resolution: ScreenResolution
  fps: ScreenFps
}

export interface ScreenCapture {
  resolution: { width: number; height: number; frameRate: number }
  contentHint: 'detail' | 'motion'
  maxBitrate: number
}

export const DEFAULT_SCREEN_QUALITY: ScreenQuality = { resolution: '1080p', fps: 15 }

const FRAME_SIZE: Record<ScreenResolution, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  original: { width: 3840, height: 2160 }
}

const BITRATE: Record<ScreenResolution, Record<ScreenFps, number>> = {
  '720p': { 15: 1_500_000, 30: 2_500_000, 60: 4_000_000 },
  '1080p': { 15: 2_500_000, 30: 4_000_000, 60: 6_000_000 },
  '1440p': { 15: 4_000_000, 30: 7_000_000, 60: 12_000_000 },
  original: { 15: 6_000_000, 30: 10_000_000, 60: 16_000_000 }
}

const DETAIL_MAX_FPS = 15

export function screenCapture({ resolution, fps }: ScreenQuality): ScreenCapture {
  return {
    resolution: { ...FRAME_SIZE[resolution], frameRate: fps },
    contentHint: fps <= DETAIL_MAX_FPS ? 'detail' : 'motion',
    maxBitrate: BITRATE[resolution][fps]
  }
}

export function parseScreenQuality(value: unknown): ScreenQuality {
  if (typeof value !== 'object' || value === null) return DEFAULT_SCREEN_QUALITY
  const { resolution, fps } = value as Record<string, unknown>
  const validResolution = SCREEN_RESOLUTIONS.find((r) => r === resolution)
  const validFps = SCREEN_FPS.find((f) => f === fps)
  return validResolution && validFps ? { resolution: validResolution, fps: validFps } : DEFAULT_SCREEN_QUALITY
}
