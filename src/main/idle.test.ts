import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDLE_CHECK_MS } from '../shared/idle'

type Handler = (...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
let systemIdleSeconds = 0

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: Handler) => handlers.set(channel, fn) },
  powerMonitor: { getSystemIdleTime: () => systemIdleSeconds }
}))

const { createIdleWatcher, setupIdle } = await import('./idle')

beforeEach(() => {
  handlers.clear()
  systemIdleSeconds = 0
  vi.useRealTimers()
})

describe('createIdleWatcher', () => {
  let tick: () => void
  let interval: number | null
  let cleared: unknown[]
  let changes: boolean[]
  let seconds: number

  function setup() {
    return createIdleWatcher({
      idleSeconds: () => seconds,
      onChange: (idle) => changes.push(idle),
      setInterval: (fn, ms) => {
        tick = fn
        interval = ms
        return 7
      },
      clearInterval: (id) => cleared.push(id)
    })
  }

  beforeEach(() => {
    interval = null
    cleared = []
    changes = []
    seconds = 0
  })

  it('confere o tempo parado do sistema de tempos em tempos', () => {
    setup()
    expect(interval).toBe(IDLE_CHECK_MS)
  })

  it('avisa ausente aos 10 minutos parado e online ao mexer, só quando muda', () => {
    const watcher = setup()
    seconds = 599
    tick()
    expect(changes).toEqual([])
    seconds = 600
    tick()
    seconds = 640
    tick()
    expect(changes).toEqual([true])
    expect(watcher.isIdle()).toBe(true)
    seconds = 2
    tick()
    tick()
    expect(changes).toEqual([true, false])
    expect(watcher.isIdle()).toBe(false)
  })

  it('destroy para de conferir', () => {
    setup().destroy()
    expect(cleared).toEqual([7])
  })
})

describe('setupIdle', () => {
  it('lê o tempo parado do powerMonitor, manda a mudança para a janela e responde o estado atual', async () => {
    vi.useFakeTimers()
    const send = vi.fn()
    const watcher = setupIdle(() => ({ webContents: { send } }) as never)
    systemIdleSeconds = 601
    vi.advanceTimersByTime(IDLE_CHECK_MS)
    expect(send).toHaveBeenCalledWith('idle-change', true)
    expect(await handlers.get('idle-get')?.()).toBe(true)
    watcher.destroy()
  })

  it('sem janela não quebra', () => {
    vi.useFakeTimers()
    const watcher = setupIdle(() => null)
    systemIdleSeconds = 601
    expect(() => vi.advanceTimersByTime(IDLE_CHECK_MS)).not.toThrow()
    watcher.destroy()
  })
})
