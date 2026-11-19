import { AccessToken, TrackSource as GrantSource } from 'livekit-server-sdk'
import { MUSIC_BOT_NAME } from '../../src/shared/types'
import type { LiveKitConfig } from '../livekit'
import { PCM_CHANNELS, PCM_SAMPLE_RATE, type RoomOutput, type RoomPublisher } from './ports'

export const musicBotIdentity = (channelId: string): string => `music-bot:${channelId}`

export function musicBotToken(config: LiveKitConfig, channelId: string): Promise<string> {
  const at = new AccessToken(config.apiKey, config.apiSecret, {
    identity: musicBotIdentity(channelId),
    name: MUSIC_BOT_NAME,
    attributes: { bot: 'music' }
  })
  at.addGrant({
    room: channelId,
    roomJoin: true,
    roomCreate: false,
    roomList: false,
    roomAdmin: false,
    canSubscribe: false,
    canPublish: true,
    canPublishSources: [GrantSource.MICROPHONE],
    canPublishData: false,
    canUpdateOwnMetadata: false
  })
  return at.toJwt()
}

export const rtcUrl = (config: LiveKitConfig): string => config.apiUrl.replace(/^http/, 'ws')

export class LiveKitPublisher implements RoomPublisher {
  constructor(private readonly config: LiveKitConfig) {}

  async join(channelId: string): Promise<RoomOutput> {
    const { AudioFrame, AudioSource, LocalAudioTrack, Room, TrackPublishOptions, TrackSource } = await import('@livekit/rtc-node')
    const room = new Room()
    await room.connect(rtcUrl(this.config), await musicBotToken(this.config, channelId), { autoSubscribe: false, dynacast: false })
    const source = new AudioSource(PCM_SAMPLE_RATE, PCM_CHANNELS)
    try {
      const track = LocalAudioTrack.createAudioTrack('musica', source)
      await room.localParticipant?.publishTrack(track, new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }))
    } catch (err) {
      await room.disconnect()
      throw err
    }
    return {
      play: (frame) => source.captureFrame(new AudioFrame(frame, PCM_SAMPLE_RATE, PCM_CHANNELS, frame.length / PCM_CHANNELS)),
      clearQueue: () => source.clearQueue(),
      leave: async () => {
        await source.close().catch(() => {})
        await room.disconnect()
      }
    }
  }
}
