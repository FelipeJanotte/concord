export interface VoiceState {
  userId: string
  channelId: string
  muted: boolean
  deafened: boolean
  sharing: boolean
  serverMuted?: boolean
  watching?: string[]
}

export interface VoiceCredentials {
  url: string
  token: string
}

export interface VoicePermissions {
  canSpeak: boolean
  canShare: boolean
  canVideo: boolean
}

export type JoinVoiceResult = ({ ok: true } & VoiceCredentials & VoicePermissions) | { ok: false; error: string }

export type ScreenCredentialsResult = ({ ok: true } & VoiceCredentials) | { ok: false; error: string }

export type ScreenPreviewResult = { ok: true; image: string | null } | { ok: false; error: string }

export const SCREEN_PREVIEW_PREFIX = 'data:image/jpeg;base64,'
export const SCREEN_PREVIEW_MAX_CHARS = 200_000
export const SCREEN_PREVIEW_WIDTH = 480
export const SCREEN_PREVIEW_INTERVAL_MS = 5000
export const MAX_WATCHED_SCREENS = 25

export interface VoiceServerEvents {
  'voice:state': (voice: VoiceState[]) => void
}

export interface VoiceClientEvents {
  'voice:join': (
    payload: { channelId: string; muted: boolean; deafened: boolean },
    ack: (res: JoinVoiceResult) => void
  ) => void
  'voice:leave': () => void
  'voice:update': (payload: { muted: boolean; deafened: boolean }) => void
  'voice:sharing': (sharing: boolean) => void
  'voice:screen-credentials': (ack: (res: ScreenCredentialsResult) => void) => void
  'voice:watching': (screenIds: string[]) => void
  'voice:preview': (image: string) => void
  'voice:preview-get': (userId: string, ack: (res: ScreenPreviewResult) => void) => void
}
