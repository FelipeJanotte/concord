import { liveKitConfig } from '../livekit'
import { LiveKitPublisher } from './livekit-publisher'
import type { MusicPlayback, TrackResolver } from './ports'
import { spotifyFromEnv } from './spotify'
import { audioToolsFromEnv, YtDlpFfmpegSource } from './youtube'

export interface MusicDrivers extends MusicPlayback {
  resolver: TrackResolver
}

let playbackOverride: MusicPlayback | null = null

export function replaceMusicPlayback(playback: MusicPlayback): void {
  playbackOverride = playback
}

function defaultPlayback(env: NodeJS.ProcessEnv): MusicPlayback | null {
  if (!liveKitConfig) return null
  return { source: new YtDlpFfmpegSource(audioToolsFromEnv(env)), publisher: new LiveKitPublisher(liveKitConfig) }
}

export function musicDrivers(env: NodeJS.ProcessEnv = process.env): MusicDrivers | null {
  const resolver = spotifyFromEnv(env)
  const playback = playbackOverride ?? defaultPlayback(env)
  if (!resolver || !playback) return null
  return { resolver, ...playback }
}
