import { overrideMusicDrivers } from '../music/drivers'
import type { AudioStream, PreparedAudio, QueuedTrack } from '../music/ports'
import { fakeYtDlp } from './fake-youtube'

export const FAKE_PLAYBACK_SPEEDUP = 100
const FRAME_INTERVAL_MS = 20

function fakeStream(track: QueuedTrack): AudioStream {
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

function fakePrepared(track: QueuedTrack): PreparedAudio {
  let stream: AudioStream | null = null
  return {
    open: () => (stream = fakeStream(track)),
    close: () => stream?.close()
  }
}

overrideMusicDrivers({
  ytDlp: async (args) => fakeYtDlp(args),
  playback: {
    source: { prepare: fakePrepared },
    publisher: {
      async join(channelId: string) {
        console.log(`[fake-music] join ${channelId}`)
        return {
          play: async () => {},
          leave: async () => void console.log(`[fake-music] leave ${channelId}`)
        }
      }
    }
  }
})
