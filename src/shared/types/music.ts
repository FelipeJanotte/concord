export const MUSIC_MAX_TRACK_MS = 15 * 60_000
export const MUSIC_QUEUE_MAX = 100
export const MUSIC_QUERY_MAX = 500
export const MUSIC_BOT_NAME = 'Música'

export interface MusicRequester {
  accountId: string
  name: string
}

export interface MusicTrack {
  id: string
  title: string
  artists: string[]
  coverUrl: string | null
  durationMs: number
  url: string
  requestedBy: MusicRequester
}

export interface MusicState {
  channelId: string
  nowPlaying: MusicTrack | null
  queue: MusicTrack[]
}

export type MusicResult = { ok: true; state: MusicState } | { ok: false; error: string }

export type MusicPlayResult = { ok: true; state: MusicState; added: number } | { ok: false; error: string }

export interface MusicServerEvents {
  'music:state': (state: MusicState) => void
}

export interface MusicClientEvents {
  'music:play': (payload: { channelId: string; query: string }, ack: (res: MusicPlayResult) => void) => void
  'music:skip': (channelId: string, ack: (res: MusicResult) => void) => void
  'music:stop': (channelId: string, ack: (res: MusicResult) => void) => void
  'music:queue': (channelId: string, ack: (res: MusicResult) => void) => void
}
