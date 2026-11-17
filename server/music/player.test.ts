import { describe, expect, it, vi } from 'vitest'
import type { MusicState } from '../../src/shared/types'
import { MusicPlayer } from './player'
import type { AudioLocator, AudioSource, AudioStream, PreparedAudio, QueuedTrack, RoomOutput, RoomPublisher } from './ports'

const track = (id: string): QueuedTrack => ({
  id,
  title: `Música ${id}`,
  artists: ['Banda'],
  coverUrl: null,
  durationMs: 180_000,
  url: `https://open.spotify.com/track/${id}`,
  audio: { kind: 'youtube-search', query: `Banda - Música ${id}` },
  requestedBy: { accountId: 'acc', name: 'Ana' }
})

const watch = (id: string): string => `https://www.youtube.com/watch?v=${id}`
const withDirect = (id: string): QueuedTrack => ({
  ...track(id),
  audio: { kind: 'audio-url', url: watch(id), direct: { url: `https://rr1.googlevideo.com/videoplayback?id=${id}`, fetchedAt: 1000 } }
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

class FakePrepared implements PreparedAudio {
  closed = false
  stream: ControlledStream | null = null

  constructor(
    readonly title: string,
    private readonly source: FakeSource
  ) {}

  open(): AudioStream {
    this.stream = new ControlledStream(this.title)
    this.source.opened.push(this.stream)
    return this.stream
  }

  close(): void {
    this.closed = true
    this.stream?.close()
  }
}

class FakeSource implements AudioSource {
  prepared: FakePrepared[] = []
  opened: ControlledStream[] = []
  audios: AudioLocator[] = []
  prepare(t: QueuedTrack): PreparedAudio {
    this.audios.push(t.audio)
    const prepared = new FakePrepared(t.title, this)
    this.prepared.push(prepared)
    return prepared
  }
  last(): ControlledStream {
    return this.opened[this.opened.length - 1]
  }
  preparedTitles(): string[] {
    return this.prepared.map((p) => p.title)
  }
  live(): string[] {
    return this.prepared.filter((p) => !p.closed).map((p) => p.title)
  }
}

class FakePublisher implements RoomPublisher {
  log: string[] = []
  frames: Int16Array[] = []
  fail = false
  gate: Promise<void> | null = null
  async join(channelId: string): Promise<RoomOutput> {
    await this.gate
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
const startPlaying = async (source: FakeSource): Promise<void> => {
  source.last().send(new Int16Array(960))
  await settle()
}

describe('MusicPlayer', () => {
  it('a primeira música faz o bot entrar na sala e tocar os quadros da fonte', async () => {
    const { player, source, publisher, states } = setup()
    player.add('sala', [track('a')])
    expect(titles(states.at(-1)!)).toEqual(['Música a'])
    await settle()
    expect(publisher.log).toEqual(['join sala'])
    const frame = new Int16Array(960)
    source.last().send(frame)
    await settle()
    expect(publisher.frames).toEqual([frame])
  })

  it('várias músicas de uma vez: um aviso só, com quantas entraram', async () => {
    const { player, states } = setup()
    expect(player.add('sala', [track('a'), track('b'), track('c')])).toMatchObject({ ok: true, added: 3 })
    expect(states).toHaveLength(1)
    expect(titles(states[0])).toEqual(['Música a', 'Música b', 'Música c'])
    player.stop('sala')
    await settle()
  })

  it('o estado público não leva de onde vem o áudio', async () => {
    const { player, states } = setup()
    player.add('sala', [track('a'), track('b')])
    const state = player.state('sala')
    expect(state.nowPlaying).not.toHaveProperty('audio')
    expect(state.queue[0]).not.toHaveProperty('audio')
    expect(states[0].nowPlaying).not.toHaveProperty('audio')
    player.stop('sala')
    await settle()
  })

  it('quando a faixa acaba, toca a próxima; quando a fila acaba, o bot sai', async () => {
    const { player, source, publisher, states } = setup()
    player.add('sala', [track('a')])
    player.add('sala', [track('b')])
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
    player.add('sala', [track('a')])
    player.add('sala', [track('b')])
    player.add('sala', [track('c')])
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
    player.add('sala', [track('a')])
    player.add('sala', [track('b')])
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
    player.add('sala', [track('a')])
    player.stop('sala')
    await settle()
    expect(source.opened).toEqual([])
    expect(publisher.log).toEqual(['join sala', 'leave sala'])
  })

  it('cada sala tem a sua fila e o seu bot', async () => {
    const { player, publisher } = setup()
    player.add('sala-1', [track('a')])
    player.add('sala-2', [track('b')])
    await settle()
    expect(publisher.log.sort()).toEqual(['join sala-1', 'join sala-2'])
    expect(titles(player.state('sala-1'))).toEqual(['Música a'])
    expect(titles(player.state('sala-2'))).toEqual(['Música b'])
  })

  it('fonte que falha pula para a próxima', async () => {
    const { player, publisher } = setup()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken: AudioSource = {
      prepare: (t) => ({
        close: () => {},
        open: () => {
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
      })
    }
    const p = new MusicPlayer({ source: broken, publisher }, () => {})
    p.add('sala', [track('a')])
    p.add('sala', [track('b')])
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
    player.add('sala', [track('a')])
    await settle()
    expect(player.activeRooms()).toEqual([])
    expect(states.at(-1)?.nowPlaying).toBeNull()
    vi.restoreAllMocks()
  })

  describe('pré-busca', () => {
    it('a primeira faixa começa a ser preparada antes de o bot terminar de entrar', async () => {
      const { player, source, publisher } = setup()
      let joined = (): void => {}
      publisher.gate = new Promise((r) => (joined = r))
      player.add('sala', [track('a')])
      await settle()
      expect(source.preparedTitles()).toEqual(['Música a'])
      expect(source.opened).toEqual([])
      joined()
      await settle()
      expect(source.opened.map((s) => s.title)).toEqual(['Música a'])
    })

    it('a próxima só é preparada depois que a atual começa a tocar, e só ela', async () => {
      const { player, source } = setup()
      player.add('sala', [track('a'), track('b'), track('c')])
      await settle()
      expect(source.live()).toEqual(['Música a'])
      await startPlaying(source)
      expect(source.live()).toEqual(['Música a', 'Música b'])
      expect(source.opened.map((s) => s.title)).toEqual(['Música a'])
    })

    it('música que entra na fila vazia durante a reprodução é preparada na hora', async () => {
      const { player, source } = setup()
      player.add('sala', [track('a')])
      await settle()
      await startPlaying(source)
      player.add('sala', [track('b')])
      expect(source.live()).toEqual(['Música a', 'Música b'])
    })

    it('a troca toca o que já estava preparado e prepara a seguinte', async () => {
      const { player, source } = setup()
      player.add('sala', [track('a'), track('b'), track('c')])
      await settle()
      await startPlaying(source)
      source.last().end()
      await settle()
      expect(source.live()).toEqual(['Música b'])
      await startPlaying(source)
      expect(source.preparedTitles()).toEqual(['Música a', 'Música b', 'Música c'])
      expect(source.live()).toEqual(['Música b', 'Música c'])
      expect(source.last().title).toBe('Música b')
    })

    it('pular fecha a atual, toca a preparada sem preparar de novo e prepara a seguinte', async () => {
      const { player, source } = setup()
      player.add('sala', [track('a'), track('b'), track('c')])
      await settle()
      await startPlaying(source)
      player.skip('sala')
      await settle()
      await startPlaying(source)
      expect(source.preparedTitles()).toEqual(['Música a', 'Música b', 'Música c'])
      expect(source.live()).toEqual(['Música b', 'Música c'])
      expect(source.last().title).toBe('Música b')
    })

    it('parar fecha a faixa tocando e a preparada', async () => {
      const { player, source } = setup()
      player.add('sala', [track('a'), track('b')])
      await settle()
      await startPlaying(source)
      expect(source.live()).toEqual(['Música a', 'Música b'])
      player.stop('sala')
      await settle()
      expect(source.live()).toEqual([])
    })

    it('parar antes de o bot entrar fecha o que foi preparado', async () => {
      const { player, source } = setup()
      player.add('sala', [track('a'), track('b')])
      player.stop('sala')
      await settle()
      expect(source.prepared.length).toBeGreaterThan(0)
      expect(source.live()).toEqual([])
    })

    it('o bot não consegue entrar: fecha o que foi preparado', async () => {
      const { player, source, publisher } = setup()
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      publisher.fail = true
      player.add('sala', [track('a'), track('b')])
      await settle()
      expect(source.live()).toEqual([])
      vi.restoreAllMocks()
    })

    it('a faixa que toca já leva o endereço direto do áudio que veio com ela', async () => {
      const { player, source } = setup()
      player.add('sala', [withDirect('a'), withDirect('b')])
      expect(source.audios).toEqual([withDirect('a').audio])
      player.stop('sala')
      await settle()
    })

    it('faixa que esperou na fila é preparada sem o endereço guardado', async () => {
      const { player, source } = setup()
      player.add('sala', [withDirect('a'), withDirect('b')])
      await settle()
      await startPlaying(source)
      expect(source.audios[1]).toEqual({ kind: 'audio-url', url: watch('b') })
      player.stop('sala')
      await settle()
    })

    it('faixa que entra numa sala já tocando é preparada sem o endereço guardado', async () => {
      const { player, source } = setup()
      player.add('sala', [track('a')])
      await settle()
      await startPlaying(source)
      player.add('sala', [withDirect('b')])
      expect(source.audios[1]).toEqual({ kind: 'audio-url', url: watch('b') })
      player.stop('sala')
      await settle()
    })

    it('fila que acaba sozinha não deixa nada preparado', async () => {
      const { player, source } = setup()
      player.add('sala', [track('a'), track('b')])
      await settle()
      await startPlaying(source)
      source.last().end()
      await settle()
      await startPlaying(source)
      source.last().end()
      await settle()
      expect(source.live()).toEqual([])
    })
  })
})
