// Sons sintetizados (ChimePlayer) e a regra de quem entrou/saiu da sala (roomChanges).
import { describe, expect, it, vi } from 'vitest'
import type { VoiceState } from '@shared/types'
import { ChimePlayer, MERGE_WINDOW_MS } from './chime'
import { roomChanges } from './transitions'

class FakeParam {
  calls: [string, number, number][] = []
  setValueAtTime(v: number, t: number): void {
    this.calls.push(['set', v, t])
  }
  exponentialRampToValueAtTime(v: number, t: number): void {
    this.calls.push(['ramp', v, t])
  }
}

class FakeContext {
  currentTime = 10
  destination = {}
  oscillators: { type: string; frequency: FakeParam; started: number; stopped: number }[] = []
  gains: { gain: FakeParam }[] = []
  setSinkId = vi.fn(async (_id: string) => {})
  resume = vi.fn(async () => {})
  createOscillator() {
    const osc = {
      type: '',
      frequency: new FakeParam(),
      started: -1,
      stopped: -1,
      connect: vi.fn(),
      start(t: number) {
        osc.started = t
      },
      stop(t: number) {
        osc.stopped = t
      }
    }
    this.oscillators.push(osc)
    return osc
  }
  createGain() {
    const g = { gain: new FakeParam(), connect: vi.fn() }
    this.gains.push(g)
    return g
  }
}

function player(opts: { now?: () => number; ctx?: FakeContext } = {}) {
  const ctx = opts.ctx ?? new FakeContext()
  const create = vi.fn(() => ctx as unknown as AudioContext)
  let t = 0
  const p = new ChimePlayer({ createContext: create, now: opts.now ?? (() => (t += 1000)) })
  return { p, ctx, create }
}

const peakOf = (g: { gain: FakeParam }): number => Math.max(...g.gain.calls.map((c) => c[1]))

describe('ChimePlayer', () => {
  it('entrada: duas notas subindo; saída: descendo', () => {
    const { p, ctx } = player()
    expect(p.play('join', { volume: 1, outputId: null })).toBe(true)
    expect(ctx.oscillators.map((o) => o.frequency.calls[0][1])).toEqual([523.25, 783.99])
    expect(ctx.oscillators[1].started).toBeGreaterThan(ctx.oscillators[0].started)
    p.play('leave', { volume: 1, outputId: null })
    expect(ctx.oscillators.slice(2).map((o) => o.frequency.calls[0][1])).toEqual([783.99, 523.25])
  })

  it('pressione para falar (B20): uma nota só, aguda ao abrir e grave ao fechar', () => {
    const { p, ctx } = player()
    p.play('ptt-on', { volume: 1, outputId: null })
    p.play('ptt-off', { volume: 1, outputId: null })
    expect(ctx.oscillators.map((o) => o.frequency.calls[0][1])).toEqual([880, 659.25])
  })

  it('notificações (B9): um som diferente para conversa privada, menção e pedido de amizade', () => {
    const { p, ctx } = player()
    const freqs = (sound: 'notify-dm' | 'notify-mention' | 'notify-friend'): number[] => {
      const before = ctx.oscillators.length
      p.play(sound, { volume: 1, outputId: null })
      return ctx.oscillators.slice(before).map((o) => o.frequency.calls[0][1])
    }
    const dm = freqs('notify-dm')
    const mention = freqs('notify-mention')
    const friend = freqs('notify-friend')
    expect(dm.length).toBeGreaterThan(0)
    expect(new Set([dm.join(), mention.join(), friend.join()]).size).toBe(3)
  })

  it('o volume escala o pico (100% ainda é baixo) e zero não toca', () => {
    const { p, ctx } = player()
    p.play('join', { volume: 1, outputId: null })
    const full = peakOf(ctx.gains[0])
    p.play('leave', { volume: 0.5, outputId: null })
    expect(peakOf(ctx.gains[2])).toBeCloseTo(full / 2)
    expect(full).toBeLessThanOrEqual(0.25)
    expect(p.play('join', { volume: 0, outputId: null })).toBe(false)
  })

  it('o mesmo som repetido em menos de 400 ms vira um só (som diferente passa)', () => {
    let now = 0
    const { p, ctx } = player({ now: () => now })
    expect(p.play('join', { volume: 1, outputId: null })).toBe(true)
    now += MERGE_WINDOW_MS - 1
    expect(p.play('join', { volume: 1, outputId: null })).toBe(false)
    expect(p.play('leave', { volume: 1, outputId: null })).toBe(true)
    now += 2
    expect(p.play('join', { volume: 1, outputId: null })).toBe(true)
    expect(ctx.oscillators).toHaveLength(6)
  })

  it('cria o AudioContext uma vez e usa a saída escolhida só quando muda', () => {
    const { p, ctx, create } = player()
    p.play('join', { volume: 1, outputId: 'fone' })
    p.play('leave', { volume: 1, outputId: 'fone' })
    p.play('join', { volume: 1, outputId: null })
    expect(create).toHaveBeenCalledTimes(1)
    expect(ctx.setSinkId.mock.calls).toEqual([['fone'], ['']])
  })

  it('sem setSinkId (navegador que não deixa escolher) toca na saída padrão', () => {
    const ctx = new FakeContext() as FakeContext & { setSinkId?: unknown }
    delete (ctx as { setSinkId?: unknown }).setSinkId
    const { p } = player({ ctx: ctx as FakeContext })
    expect(p.play('join', { volume: 1, outputId: 'fone' })).toBe(true)
  })

  it('erro de áudio não quebra o app', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p = new ChimePlayer({
      createContext: () => {
        throw new Error('sem áudio')
      },
      now: () => 0
    })
    expect(p.play('join', { volume: 1, outputId: null })).toBe(false)
    warn.mockRestore()
  })
})

const st = (userId: string, channelId: string): VoiceState => ({ userId, channelId, muted: false, deafened: false, sharing: false })

describe('roomChanges', () => {
  it('quem apareceu e quem sumiu da minha sala', () => {
    const prev = [st('eu', 'sala'), st('ana', 'sala'), st('bia', 'sala')]
    const next = [st('eu', 'sala'), st('ana', 'sala'), st('caio', 'sala')]
    expect(roomChanges(prev, next, 'sala', 'eu')).toEqual({ joined: ['caio'], left: ['bia'] })
  })

  it('outras salas não contam; trocar de sala conta como sair (de lá) ou entrar (aqui)', () => {
    const prev = [st('ana', 'outra'), st('bia', 'sala')]
    const next = [st('ana', 'sala'), st('bia', 'outra'), st('caio', 'outra')]
    expect(roomChanges(prev, next, 'sala', 'eu')).toEqual({ joined: ['ana'], left: ['bia'] })
  })

  it('a própria conexão fica de fora', () => {
    expect(roomChanges([], [st('eu', 'sala')], 'sala', 'eu')).toEqual({ joined: [], left: [] })
  })

  it('mudar mute/deafen/tela não é entrar nem sair', () => {
    const prev = [st('ana', 'sala')]
    const next = [{ ...st('ana', 'sala'), muted: true, sharing: true }]
    expect(roomChanges(prev, next, 'sala', 'eu')).toEqual({ joined: [], left: [] })
  })
})
