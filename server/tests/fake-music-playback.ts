import { replaceMusicPlayback } from '../music/drivers'
import type { AudioStream, TrackMetadata } from '../music/ports'

export const FAKE_PLAYBACK_SPEEDUP = 100
const FRAME_INTERVAL_MS = 20

function fakeStream(track: TrackMetadata): AudioStream {
  let closed = false
  let wake: (() => void) | null = null
  return {
    close() {
      closed = true
      wake?.()
    },
    async *[Symbol.asyncIterator]() {
      const until = Date.now() + track.durationMs / FAKE_PLAYBACK_SPEEDUP
      while (!closed && Date.now() < until) {
        await new Promise<void>((resolve) => {
          wake = resolve
          setTimeout(resolve, FRAME_INTERVAL_MS)
        })
        if (!closed) yield new Int16Array(960)
      }
    }
  }
}

replaceMusicPlayback({
  source: { open: fakeStream },
  publisher: {
    async join(channelId) {
      console.log(`[fake-music] join ${channelId}`)
      return {
        play: async () => {},
        leave: async () => void console.log(`[fake-music] leave ${channelId}`)
      }
    }
  }
})
