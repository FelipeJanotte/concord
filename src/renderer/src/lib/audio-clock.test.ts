import { describe, expect, it, vi } from 'vitest'
import { AudioClockWatchdog, CLOCK_CHECK_MS, type WatchedContext } from './audio-clock'

function setup(state: AudioContextState = 'running') {
  let wallMs = 0
  let tick: (() => void) | null = null
  const ctx = {
    currentTime: 0,
    state,
    suspend: vi.fn(async () => {
      ctx.state = 'suspended'
    }),
    resume: vi.fn(async () => {
      ctx.state = 'running'
    })
  }
  const recovered: number[] = []
  const clear = vi.fn()
  const watchdog = new AudioClockWatchdog(ctx as WatchedContext, {
    now: () => wallMs,
    setInterval: (fn) => {
      tick = fn
      return 'timer'
    },
    clearInterval: clear,
    onRecover: (rate) => recovered.push(rate)
  })
  const advance = async (rate: number): Promise<void> => {
    wallMs += CLOCK_CHECK_MS
    ctx.currentTime += (CLOCK_CHECK_MS / 1000) * rate
    tick?.()
    await Promise.resolve()
    await Promise.resolve()
  }
  return { ctx, watchdog, advance, recovered, clear }
}

describe('vigia do relógio do áudio', () => {
  it('relógio em dia: não mexe no contexto', async () => {
    const { ctx, watchdog, advance } = setup()
    watchdog.start()
    for (let i = 0; i < 5; i++) await advance(1)
    expect(ctx.suspend).not.toHaveBeenCalled()
  })

  it('relógio preso a 2/3 por duas medições: suspende e retoma', async () => {
    const { ctx, watchdog, advance, recovered } = setup()
    watchdog.start()
    await advance(0.66)
    expect(ctx.suspend).not.toHaveBeenCalled()
    await advance(0.66)
    expect(ctx.suspend).toHaveBeenCalledTimes(1)
    expect(ctx.resume).toHaveBeenCalledTimes(1)
    expect(ctx.state).toBe('running')
    expect(recovered).toEqual([0.66])
  })

  it('uma medição lenta isolada não conta', async () => {
    const { ctx, watchdog, advance } = setup()
    watchdog.start()
    await advance(0.5)
    await advance(1)
    await advance(0.5)
    await advance(1)
    expect(ctx.suspend).not.toHaveBeenCalled()
  })

  it('depois de destravar, mede de novo do zero', async () => {
    const { ctx, watchdog, advance } = setup()
    watchdog.start()
    await advance(0.66)
    await advance(0.66)
    await advance(0.66)
    expect(ctx.suspend).toHaveBeenCalledTimes(1)
    await advance(0.66)
    expect(ctx.suspend).toHaveBeenCalledTimes(2)
  })

  it('contexto suspenso de propósito não é "lento"', async () => {
    const { ctx, watchdog, advance } = setup('suspended')
    watchdog.start()
    await advance(0)
    await advance(0)
    await advance(0)
    expect(ctx.suspend).not.toHaveBeenCalled()
    expect(ctx.resume).not.toHaveBeenCalled()
  })

  it('stop para de medir', async () => {
    const { ctx, watchdog, advance, clear } = setup()
    watchdog.start()
    watchdog.stop()
    expect(clear).toHaveBeenCalledWith('timer')
    await advance(0.5)
    await advance(0.5)
    expect(ctx.suspend).not.toHaveBeenCalled()
  })

  it('falha ao retomar não derruba o vigia', async () => {
    const { ctx, watchdog, advance } = setup()
    ctx.resume.mockRejectedValueOnce(new Error('fechado'))
    watchdog.start()
    await advance(0.5)
    await advance(0.5)
    expect(ctx.suspend).toHaveBeenCalledTimes(1)
    await advance(0.5)
    await advance(0.5)
    expect(ctx.resume).toHaveBeenCalledTimes(2)
  })
})
