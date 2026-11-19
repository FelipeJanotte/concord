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
  paused: boolean
  elapsedMs: number
}

export type MusicCollectionKind = 'playlist' | 'album'

export interface MusicCollection {
  kind: MusicCollectionKind
  title: string
  url: string
}

export type MusicTrackSummary = Pick<MusicTrack, 'title' | 'artists' | 'coverUrl'>

export type MusicBotReply =
  | { action: 'play'; added: number; startedNow: boolean; first: MusicTrackSummary }
  | { action: 'skip'; skipped: MusicTrackSummary; next: MusicTrackSummary | null }
  | { action: 'stop' }
  | { action: 'searching'; query: string }
  | { action: 'failed'; query: string; error: string }

export interface MusicControl {
  channelId: string
  textChannelId?: string
}

export interface MusicPlayRequest extends MusicControl {
  query: string
}

export const musicTrackLabel = (track: MusicTrackSummary): string => `${track.title} — ${track.artists.join(', ')}`

export const musicSearchingText = (query: string): string => `Procurando “${query}”…`

export const musicFailedText = (error: string): string => `Não consegui tocar: ${error}`

export function musicBotReplyText(reply: MusicBotReply): string {
  switch (reply.action) {
    case 'play':
      if (reply.added > 1) return `Adicionou ${reply.added} músicas à fila, começando por ${musicTrackLabel(reply.first)}`
      return `${reply.startedNow ? 'Tocando agora' : 'Adicionou à fila'}: ${musicTrackLabel(reply.first)}`
    case 'skip':
      return `Pulou: ${musicTrackLabel(reply.skipped)}${reply.next ? `. Tocando agora: ${musicTrackLabel(reply.next)}` : ''}`
    case 'stop':
      return 'Parou a música e limpou a fila'
    case 'searching':
      return musicSearchingText(reply.query)
    case 'failed':
      return musicFailedText(reply.error)
  }
}

export type MusicResult = { ok: true; state: MusicState } | { ok: false; error: string }

export type MusicPlayResult =
  | { ok: true; state: MusicState; added: number; collection: MusicCollection | null }
  | { ok: false; error: string; posted?: true }

export interface MusicServerEvents {
  'music:state': (state: MusicState) => void
}

export interface MusicClientEvents {
  'music:play': (payload: MusicPlayRequest, ack: (res: MusicPlayResult) => void) => void
  'music:skip': (control: MusicControl, ack: (res: MusicResult) => void) => void
  'music:stop': (control: MusicControl, ack: (res: MusicResult) => void) => void
  'music:pause': (control: MusicControl, ack: (res: MusicResult) => void) => void
  'music:resume': (control: MusicControl, ack: (res: MusicResult) => void) => void
  'music:queue': (channelId: string, ack: (res: MusicResult) => void) => void
}
