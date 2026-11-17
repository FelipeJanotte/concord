import type { MusicState, MusicTrack } from '../../src/shared/types'
import type { MusicPlayback, PreparedAudio, QueuedTrack, RoomOutput } from './ports'
import { advance, EMPTY_QUEUE, enqueue, type EnqueueResult, type RoomQueue } from './queue'

interface Room {
  queue: RoomQueue
  prepared: Map<string, PreparedAudio>
  playing: QueuedTrack | null
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
    const room = existing ?? { queue: EMPTY_QUEUE, prepared: new Map(), playing: null }
    const result = enqueue(room.queue, tracks)
    if (!result.ok) return result
    room.queue = result.queue
    this.prefetch(room)
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
    this.prefetch(room)
    this.emit(channelId)
    return true
  }

  stop(channelId: string): boolean {
    const room = this.rooms.get(channelId)
    if (!room) return false
    this.rooms.delete(channelId)
    room.queue = EMPTY_QUEUE
    this.prefetch(room)
    this.emit(channelId)
    return true
  }

  private current(channelId: string, room: Room): boolean {
    return this.rooms.get(channelId) === room
  }

  private prefetch(room: Room): PreparedAudio | undefined {
    const { nowPlaying, upcoming } = room.queue
    const next = nowPlaying && room.playing === nowPlaying ? upcoming[0] : undefined
    const wanted = [nowPlaying, next].filter((t): t is QueuedTrack => !!t)
    for (const [id, audio] of room.prepared) {
      if (wanted.some((t) => t.id === id)) continue
      audio.close()
      room.prepared.delete(id)
    }
    for (const track of wanted) {
      if (!room.prepared.has(track.id)) room.prepared.set(track.id, this.playback.source.prepare(track))
    }
    return nowPlaying ? room.prepared.get(nowPlaying.id) : undefined
  }

  private release(room: Room): void {
    for (const audio of room.prepared.values()) audio.close()
    room.prepared.clear()
  }

  private async run(channelId: string, room: Room): Promise<void> {
    let output: RoomOutput | null = null
    try {
      output = await this.playback.publisher.join(channelId)
      while (this.current(channelId, room)) {
        const track = room.queue.nowPlaying
        const audio = this.prefetch(room)
        if (!track || !audio) break
        await this.playTrack(room, track, audio, output)
        if (this.current(channelId, room) && room.queue.nowPlaying === track) {
          room.queue = advance(room.queue)
          this.emit(channelId)
        }
      }
    } catch (err) {
      console.warn('[música] o bot não conseguiu entrar na sala:', err instanceof Error ? err.message : err)
    } finally {
      this.release(room)
      if (this.current(channelId, room)) {
        this.rooms.delete(channelId)
        if (room.queue.nowPlaying) this.emit(channelId)
      }
      await output?.leave().catch(() => {})
    }
  }

  private async playTrack(room: Room, track: QueuedTrack, audio: PreparedAudio, output: RoomOutput): Promise<void> {
    const stream = audio.open()
    try {
      for await (const frame of stream) {
        if (room.queue.nowPlaying !== track) break
        if (room.playing !== track) {
          room.playing = track
          this.prefetch(room)
        }
        await output.play(frame)
      }
    } catch (err) {
      console.warn(`[música] falha ao tocar "${track.title}":`, err instanceof Error ? err.message : err)
    } finally {
      stream.close()
    }
  }

  private emit(channelId: string): void {
    this.onChange(this.state(channelId))
  }
}
