import { describe, expect, it, vi } from 'vitest'
import type { MusicState } from '../../src/shared/types'
import { MusicPlayer } from './player'
import type { AudioSource, AudioStream, PreparedAudio, QueuedTrack, RoomOutput, RoomPublisher } from './ports'

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
  prepare(t: QueuedTrack): PreparedAudio {
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
      clearQueue: () => void this.log.push(`clear ${channelId}`),
      leave: async () => void this.log.push(`leave ${channelId}`)
    }
  }
}

class FakeClock {
  current = 1_000_000
  now = (): number => this.current
  advance(ms: number): void {
    this.current += ms
  }
}

function setup(randomIndex: (max: number) => number = () => 0): { player: MusicPlayer; source: FakeSource; publisher: FakePublisher; states: MusicState[]; clock: FakeClock } {
  const source = new FakeSource()
  const publisher = new FakePublisher()
  const states: MusicState[] = []
  const clock = new FakeClock()
  const player = new MusicPlayer({ source, publisher }, (s) => states.push(s), clock.now, randomIndex)
  return { player, source, publisher, states, clock }
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
    expect(player.state('sala')).toEqual({ channelId: 'sala', nowPlaying: null, queue: [], paused: false, elapsedMs: 0 })
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

  it('pular para uma da fila fecha a atual, toca a escolhida e tira as anteriores', async () => {
    const { player, source, states } = setup()
    player.add('sala', [track('a'), track('b'), track('c'), track('d')])
    await settle()
    const first = source.last()
    expect(player.jump('sala', 'c')).toBe(true)
    expect(titles(states.at(-1)!)).toEqual(['Música c', 'Música d'])
    await settle()
    expect(first.closed).toBe(true)
    expect(source.last().title).toBe('Música c')
    expect(source.preparedTitles()).not.toContain('Música b')
  })

  it('pular para uma que não está na fila: false e nada muda', async () => {
    const { player, states } = setup()
    expect(player.jump('sala', 'a')).toBe(false)
    player.add('sala', [track('a'), track('b')])
    const before = states.length
    expect(player.jump('sala', 'a')).toBe(false)
    expect(player.jump('sala', 'x')).toBe(false)
    expect(states).toHaveLength(before)
    expect(titles(player.state('sala'))).toEqual(['Música a', 'Música b'])
    player.stop('sala')
    await settle()
  })

  it('embaralhar muda só a ordem da fila, avisa o estado e prepara a nova próxima', async () => {
    const { player, source, states } = setup(() => 0)
    player.add('sala', [track('a'), track('b'), track('c'), track('d')])
    await settle()
    await startPlaying(source)
    expect(source.live()).toEqual(['Música a', 'Música b'])
    expect(player.shuffle('sala')).toBe(true)
    expect(titles(states.at(-1)!)).toEqual(['Música a', 'Música c', 'Música d', 'Música b'])
    expect(source.live()).toEqual(['Música a', 'Música c'])
    expect(source.last().closed).toBe(false)
  })

  it('embaralhar com menos de 2 na fila ou sem sala: false', async () => {
    const { player } = setup()
    expect(player.shuffle('sala')).toBe(false)
    player.add('sala', [track('a'), track('b')])
    expect(player.shuffle('sala')).toBe(false)
    player.stop('sala')
    await settle()
  })

  it('parar esvazia a fila e tira o bot da sala', async () => {
    const { player, source, publisher, states } = setup()
    player.add('sala', [track('a')])
    player.add('sala', [track('b')])
    await settle()
    expect(player.stop('sala')).toBe(true)
    await settle()
    expect(source.last().closed).toBe(true)
    expect(states.at(-1)).toEqual({ channelId: 'sala', nowPlaying: null, queue: [], paused: false, elapsedMs: 0 })
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

  describe('pausa e progresso', () => {
    it('avisa o estado no primeiro quadro, com o tempo zerado, para o relógio dos clientes começar quando o som começa', async () => {
      const { player, source, states, clock } = setup()
      player.add('sala', [track('a')])
      await settle()
      const before = states.length
      clock.advance(4_000)
      await startPlaying(source)
      expect(states).toHaveLength(before + 1)
      expect(states.at(-1)).toMatchObject({ nowPlaying: { title: 'Música a' }, paused: false, elapsedMs: 0 })
      source.last().send(new Int16Array(960))
      await settle()
      expect(states).toHaveLength(before + 1)
      player.stop('sala')
      await settle()
    })

    it('pausar esvazia o áudio já enfileirado na saída para o som parar na hora', async () => {
      const { player, source, publisher } = setup()
      player.add('sala', [track('a')])
      await settle()
      await startPlaying(source)
      expect(publisher.log).not.toContain('clear sala')
      player.pause('sala')
      expect(publisher.log).toContain('clear sala')
      player.stop('sala')
      await settle()
    })

    it('pausar segura os quadros sem fechar a fonte; continuar toca de onde parou', async () => {
      const { player, source, publisher } = setup()
      player.add('sala', [track('a')])
      await settle()
      const first = new Int16Array(960).fill(1)
      const second = new Int16Array(960).fill(2)
      const third = new Int16Array(960).fill(3)
      source.last().send(first)
      await settle()
      expect(player.pause('sala')).toBe(true)
      source.last().send(second)
      await settle()
      expect(publisher.frames).toEqual([first])
      expect(source.last().closed).toBe(false)
      expect(player.resume('sala')).toBe(true)
      source.last().send(third)
      await settle()
      expect(publisher.frames).toEqual([first, second, third])
      expect(source.opened).toHaveLength(1)
      player.stop('sala')
      await settle()
    })

    it('pausar e continuar avisam o estado com paused', async () => {
      const { player, states } = setup()
      player.add('sala', [track('a')])
      await settle()
      player.pause('sala')
      expect(states.at(-1)?.paused).toBe(true)
      player.resume('sala')
      expect(states.at(-1)?.paused).toBe(false)
      player.stop('sala')
      await settle()
    })

    it('sem música tocando, pausar e continuar não fazem nada', async () => {
      const { player, states } = setup()
      expect(player.pause('sala')).toBe(false)
      expect(player.resume('sala')).toBe(false)
      expect(states).toEqual([])
    })

    it('o progresso conta desde o primeiro quadro e não conta o tempo pausado', async () => {
      const { player, source, clock } = setup()
      player.add('sala', [track('a')])
      await settle()
      expect(player.state('sala').elapsedMs).toBe(0)
      await startPlaying(source)
      clock.advance(5_000)
      expect(player.state('sala').elapsedMs).toBe(5_000)
      player.pause('sala')
      clock.advance(60_000)
      expect(player.state('sala').elapsedMs).toBe(5_000)
      player.resume('sala')
      clock.advance(2_000)
      expect(player.state('sala').elapsedMs).toBe(7_000)
      player.stop('sala')
      await settle()
    })

    it('a próxima faixa recomeça o progresso do zero', async () => {
      const { player, source, clock } = setup()
      player.add('sala', [track('a'), track('b')])
      await settle()
      await startPlaying(source)
      clock.advance(9_000)
      player.skip('sala')
      expect(player.state('sala').elapsedMs).toBe(0)
      await settle()
      await startPlaying(source)
      clock.advance(1_500)
      expect(player.state('sala')).toMatchObject({ nowPlaying: { title: 'Música b' }, elapsedMs: 1_500 })
      player.stop('sala')
      await settle()
    })

    it('pular pausado: a próxima faixa carrega pausada e só toca ao continuar', async () => {
      const { player, source, publisher, clock } = setup()
      player.add('sala', [track('a'), track('b')])
      await settle()
      await startPlaying(source)
      player.pause('sala')
      player.skip('sala')
      await settle()
      expect(player.state('sala')).toMatchObject({ nowPlaying: { title: 'Música b' }, paused: true, elapsedMs: 0 })
      const held = publisher.frames.length
      await startPlaying(source)
      expect(publisher.frames).toHaveLength(held)
      expect(player.state('sala').elapsedMs).toBe(0)
      player.resume('sala')
      await settle()
      expect(publisher.frames).toHaveLength(held + 1)
      clock.advance(3_000)
      expect(player.state('sala')).toMatchObject({ paused: false, elapsedMs: 3_000 })
      player.stop('sala')
      await settle()
    })

    it('parar limpa a pausa: a próxima sala começa tocando', async () => {
      const { player, source, publisher } = setup()
      player.add('sala', [track('a')])
      await settle()
      player.pause('sala')
      player.stop('sala')
      await settle()
      expect(player.state('sala').paused).toBe(false)
      player.add('sala', [track('b')])
      await settle()
      await startPlaying(source)
      expect(publisher.frames).toHaveLength(1)
      player.stop('sala')
      await settle()
    })
  })
})
