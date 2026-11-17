import type { MusicState, MusicTrack } from '../../src/shared/types'
import type { AudioStream, MusicPlayback, QueuedTrack, RoomOutput } from './ports'
import { advance, EMPTY_QUEUE, enqueue, type EnqueueResult, type RoomQueue } from './queue'

interface Room {
  queue: RoomQueue
  stream: AudioStream | null
}

export type MusicListener = (state: MusicState) => void

function publicTrack({ id, title, artists, coverUrl, durationMs, url, requestedBy }: QueuedTrack): MusicTrack {
  return { id, title, artists, coverUrl, durationMs, url, requestedBy }
}

export class MusicPlayer {
  private rooms = new Map<string, Room>()

  constructor(
    private readonly playback: MusicPlayback,
    private readonly onChange: MusicListener
  ) {}

  state(channelId: string): MusicState {
    const queue = this.rooms.get(channelId)?.queue ?? EMPTY_QUEUE
    return { channelId, nowPlaying: queue.nowPlaying && publicTrack(queue.nowPlaying), queue: queue.upcoming.map(publicTrack) }
  }

  activeRooms(): string[] {
    return [...this.rooms.keys()]
  }

  add(channelId: string, tracks: QueuedTrack[]): EnqueueResult {
    const existing = this.rooms.get(channelId)
    const room = existing ?? { queue: EMPTY_QUEUE, stream: null }
    const result = enqueue(room.queue, tracks)
    if (!result.ok) return result
    room.queue = result.queue
    if (!existing) {
      this.rooms.set(channelId, room)
      void this.run(channelId, room)
    }
    this.emit(channelId)
    return result
  }

  skip(channelId: string): boolean {
    const room = this.rooms.get(channelId)
    if (!room?.queue.nowPlaying) return false
    room.queue = advance(room.queue)
    room.stream?.close()
    this.emit(channelId)
    return true
  }

  stop(channelId: string): boolean {
    const room = this.rooms.get(channelId)
    if (!room) return false
    this.rooms.delete(channelId)
    room.queue = EMPTY_QUEUE
    room.stream?.close()
    this.emit(channelId)
    return true
  }

  private current(channelId: string, room: Room): boolean {
    return this.rooms.get(channelId) === room
  }

  private async run(channelId: string, room: Room): Promise<void> {
    let output: RoomOutput | null = null
    try {
      output = await this.playback.publisher.join(channelId)
      while (this.current(channelId, room) && room.queue.nowPlaying) {
        const track = room.queue.nowPlaying
        await this.playTrack(room, track, output)
        if (this.current(channelId, room) && room.queue.nowPlaying === track) {
          room.queue = advance(room.queue)
          this.emit(channelId)
        }
      }
    } catch (err) {
      console.warn('[música] o bot não conseguiu entrar na sala:', err instanceof Error ? err.message : err)
    } finally {
      if (this.current(channelId, room)) {
        this.rooms.delete(channelId)
        if (room.queue.nowPlaying) this.emit(channelId)
      }
      await output?.leave().catch(() => {})
    }
  }

  private async playTrack(room: Room, track: QueuedTrack, output: RoomOutput): Promise<void> {
    const stream = this.playback.source.open(track)
    room.stream = stream
    try {
      for await (const frame of stream) {
        if (room.queue.nowPlaying !== track) break
        await output.play(frame)
      }
    } catch (err) {
      console.warn(`[música] falha ao tocar "${track.title}":`, err instanceof Error ? err.message : err)
    } finally {
      stream.close()
      room.stream = null
    }
  }

  private emit(channelId: string): void {
    this.onChange(this.state(channelId))
  }
}
