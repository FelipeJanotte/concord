import { describe, expect, it, vi } from 'vitest'
import type { MusicState, MusicTrack } from '../../src/shared/types'
import { MusicPlayer } from './player'
import type { AudioSource, AudioStream, RoomOutput, RoomPublisher, TrackMetadata } from './ports'

const track = (id: string): MusicTrack => ({
  id,
  title: `Música ${id}`,
  artists: ['Banda'],
  coverUrl: null,
  durationMs: 180_000,
  url: `https://open.spotify.com/track/${id}`,
  requestedBy: { accountId: 'acc', name: 'Ana' }
})

class ControlledStream implements AudioStream {
  closed = false
  private queued: (Int16Array | null)[] = []
  private wake: (() => void) | null = null

  constructor(readonly title: string) {}

  send(frame: Int16Array): void {
    this.queued.push(frame)
    this.wake?.()
  }

  end(): void {
    this.queued.push(null)
    this.wake?.()
  }

  close(): void {
    this.closed = true
    this.end()
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Int16Array> {
    while (true) {
      if (!this.queued.length) await new Promise<void>((r) => (this.wake = r))
      const next = this.queued.shift()
      if (!next) return
      yield next
    }
  }
}

class FakeSource implements AudioSource {
  opened: ControlledStream[] = []
  open(t: TrackMetadata): AudioStream {
    const stream = new ControlledStream(t.title)
    this.opened.push(stream)
    return stream
  }
  last(): ControlledStream {
    return this.opened[this.opened.length - 1]
  }
}

class FakePublisher implements RoomPublisher {
  log: string[] = []
  frames: Int16Array[] = []
  fail = false
  async join(channelId: string): Promise<RoomOutput> {
    if (this.fail) throw new Error('LiveKit fora do ar')
    this.log.push(`join ${channelId}`)
    return {
      play: async (frame) => void this.frames.push(frame),
      leave: async () => void this.log.push(`leave ${channelId}`)
    }
  }
}

function setup(): { player: MusicPlayer; source: FakeSource; publisher: FakePublisher; states: MusicState[] } {
  const source = new FakeSource()
  const publisher = new FakePublisher()
  const states: MusicState[] = []
  const player = new MusicPlayer({ source, publisher }, (s) => states.push(s))
  return { player, source, publisher, states }
}

const titles = (s: MusicState): (string | undefined)[] => [s.nowPlaying?.title, ...s.queue.map((t) => t.title)]
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('MusicPlayer', () => {
  it('a primeira música faz o bot entrar na sala e tocar os quadros da fonte', async () => {
    const { player, source, publisher, states } = setup()
    player.add('sala', track('a'))
    expect(titles(states.at(-1)!)).toEqual(['Música a'])
    await settle()
    expect(publisher.log).toEqual(['join sala'])
    const frame = new Int16Array(960)
    source.last().send(frame)
    await settle()
    expect(publisher.frames).toEqual([frame])
  })

  it('quando a faixa acaba, toca a próxima; quando a fila acaba, o bot sai', async () => {
    const { player, source, publisher, states } = setup()
    player.add('sala', track('a'))
    player.add('sala', track('b'))
    await settle()
    source.last().end()
    await settle()
    expect(titles(player.state('sala'))).toEqual(['Música b'])
    expect(source.last().title).toBe('Música b')
    source.last().end()
    await settle()
    expect(player.state('sala')).toEqual({ channelId: 'sala', nowPlaying: null, queue: [] })
    expect(states.at(-1)?.nowPlaying).toBeNull()
    expect(publisher.log).toEqual(['join sala', 'leave sala'])
    expect(player.activeRooms()).toEqual([])
  })

  it('pular fecha a fonte atual e passa para a próxima', async () => {
    const { player, source } = setup()
    player.add('sala', track('a'))
    player.add('sala', track('b'))
    player.add('sala', track('c'))
    await settle()
    const first = source.last()
    expect(player.skip('sala')).toBe(true)
    await settle()
    expect(first.closed).toBe(true)
    expect(titles(player.state('sala'))).toEqual(['Música b', 'Música c'])
    expect(source.opened.map((s) => s.title)).toEqual(['Música a', 'Música b'])
  })

  it('parar esvazia a fila e tira o bot da sala', async () => {
    const { player, source, publisher, states } = setup()
    player.add('sala', track('a'))
    player.add('sala', track('b'))
    await settle()
    expect(player.stop('sala')).toBe(true)
    await settle()
    expect(source.last().closed).toBe(true)
    expect(states.at(-1)).toEqual({ channelId: 'sala', nowPlaying: null, queue: [] })
    expect(publisher.log).toEqual(['join sala', 'leave sala'])
    expect(player.skip('sala')).toBe(false)
    expect(player.stop('sala')).toBe(false)
  })

  it('parar antes de o bot terminar de entrar: ele entra e sai sem tocar', async () => {
    const { player, source, publisher } = setup()
    player.add('sala', track('a'))
    player.stop('sala')
    await settle()
    expect(source.opened).toEqual([])
    expect(publisher.log).toEqual(['join sala', 'leave sala'])
  })

  it('cada sala tem a sua fila e o seu bot', async () => {
    const { player, publisher } = setup()
    player.add('sala-1', track('a'))
    player.add('sala-2', track('b'))
    await settle()
    expect(publisher.log.sort()).toEqual(['join sala-1', 'join sala-2'])
    expect(titles(player.state('sala-1'))).toEqual(['Música a'])
    expect(titles(player.state('sala-2'))).toEqual(['Música b'])
  })

  it('fonte que falha pula para a próxima', async () => {
    const { player, publisher } = setup()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: AudioSource = {
      open: (t) => {
        if (t.title === 'Música a') {
          return {
            close: () => {},
            async *[Symbol.asyncIterator]() {
              throw new Error('yt-dlp não encontrado no servidor')
            }
          }
        }
        return new ControlledStream(t.title)
      }
    }
    const p = new MusicPlayer({ source: broken, publisher }, () => {})
    p.add('sala', track('a'))
    p.add('sala', track('b'))
    await settle()
    await settle()
    expect(titles(p.state('sala'))).toEqual(['Música b'])
    expect(player.activeRooms()).toEqual([])
    vi.restoreAllMocks()
  })

  it('o bot não consegue entrar: fila zerada e aviso de estado vazio', async () => {
    const { player, publisher, states } = setup()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    publisher.fail = true
    player.add('sala', track('a'))
    await settle()
    expect(player.activeRooms()).toEqual([])
    expect(states.at(-1)?.nowPlaying).toBeNull()
    vi.restoreAllMocks()
  })
})
