import type { MusicTrack } from '../../src/shared/types'

export const PCM_SAMPLE_RATE = 48_000
export const PCM_CHANNELS = 2
export const PCM_FRAME_SAMPLES = PCM_SAMPLE_RATE / 100

export type AudioLocator = { kind: 'youtube-search'; query: string } | { kind: 'audio-url'; url: string }

export interface TrackMetadata {
  title: string
  artists: string[]
  coverUrl: string | null
  durationMs: number
  url: string
  live: boolean
  audio: AudioLocator
}

export type QueuedTrack = MusicTrack & { audio: AudioLocator }

export type SpotifyKind = 'track' | 'playlist' | 'album'

export type MusicQuery =
  | { kind: 'spotify'; type: SpotifyKind; id: string }
  | { kind: 'youtube-video'; id: string }
  | { kind: 'youtube-playlist'; id: string }
  | { kind: 'search'; text: string }

export class MusicError extends Error {}

export interface TrackResolver<Q extends MusicQuery = MusicQuery> {
  resolve(query: Q): Promise<TrackMetadata[]>
}

export interface AudioStream extends AsyncIterable<Int16Array> {
  close(): void
}

export interface AudioSource {
  open(track: QueuedTrack): AudioStream
}

export interface RoomOutput {
  play(frame: Int16Array): Promise<void>
  leave(): Promise<void>
}

export interface RoomPublisher {
  join(channelId: string): Promise<RoomOutput>
}

export interface MusicPlayback {
  source: AudioSource
  publisher: RoomPublisher
}

export const PLAYLIST_READ_MAX = 200
