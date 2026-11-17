export const PCM_SAMPLE_RATE = 48_000
export const PCM_CHANNELS = 2
export const PCM_FRAME_SAMPLES = PCM_SAMPLE_RATE / 100

export interface TrackMetadata {
  title: string
  artists: string[]
  coverUrl: string | null
  durationMs: number
  url: string
}

export class MusicError extends Error {}

export interface TrackResolver {
  resolve(url: string): Promise<TrackMetadata>
}

export interface AudioStream extends AsyncIterable<Int16Array> {
  close(): void
}

export interface AudioSource {
  open(track: TrackMetadata): AudioStream
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
