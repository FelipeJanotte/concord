import { liveKitConfig } from '../livekit'
import { audioToolsFromEnv, YtDlpFfmpegSource } from './audio-source'
import { MusicCatalog } from './catalog'
import { LiveKitPublisher } from './livekit-publisher'
import type { MusicPlayback } from './ports'
import { spotifyFromEnv } from './spotify'
import { YouTubeResolver, ytDlpRunner, type YtDlpJson } from './youtube'

export interface MusicDrivers extends MusicPlayback {
  catalog: MusicCatalog
}

export interface MusicDriverOverrides {
  playback?: MusicPlayback
  ytDlp?: YtDlpJson
}

let overrides: MusicDriverOverrides = {}

export function overrideMusicDrivers(next: MusicDriverOverrides): void {
  overrides = { ...overrides, ...next }
}

function defaultPlayback(env: NodeJS.ProcessEnv): MusicPlayback | null {
  if (!liveKitConfig) return null
  return { source: new YtDlpFfmpegSource(audioToolsFromEnv(env)), publisher: new LiveKitPublisher(liveKitConfig) }
}

export function musicDrivers(env: NodeJS.ProcessEnv = process.env): MusicDrivers | null {
  const playback = overrides.playback ?? defaultPlayback(env)
  if (!playback) return null
  const youtube = new YouTubeResolver(overrides.ytDlp ?? ytDlpRunner(audioToolsFromEnv(env).ytDlp))
  return { ...playback, catalog: new MusicCatalog(spotifyFromEnv(env), youtube) }
}
