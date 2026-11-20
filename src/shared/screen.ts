export interface ScreenSource {
  id: string
  name: string
  kind: 'screen' | 'window'
  thumbnail: string
  appIcon: string | null
}

export type ScreenAudioChoice = 'with-system-audio' | 'without-audio'

export interface ScreenShareStart {
  sourceId: string
  audio: boolean
  url: string
  token: string
}

export type ScreenShareEndReason = 'stopped' | 'source-closed' | 'disconnected' | 'failed'

export interface ScreenShareBridge {
  getSources: () => Promise<ScreenSource[]>
  start: (request: ScreenShareStart) => Promise<void>
  stop: () => Promise<void>
  preview: () => Promise<string>
  onEnded: (listener: (reason: ScreenShareEndReason) => void) => () => void
  canShareAudio: boolean
}
