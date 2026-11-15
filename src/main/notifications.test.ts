// Notificações no processo principal (B9), com um Electron falso: validação do que vem do renderer,
// notificação mostrada e clique que traz a janela de volta, selo (Windows × macOS/Linux).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (...args: unknown[]) => void
const handlers = new Map<string, Handler>()
const shown: FakeNotification[] = []

class FakeNotification {
  static isSupported = (): boolean => true
  listeners = new Map<string, () => void>()
  constructor(public options: { title: string; body: string; silent: boolean }) {}
  on(event: string, fn: () => void): this {
    this.listeners.set(event, fn)
    return this
  }
  show(): void {
    shown.push(this)
  }
}

const app = { setBadgeCount: vi.fn() }
vi.mock('electron', () => ({
  app,
  ipcMain: { on: (channel: string, fn: Handler) => handlers.set(channel, fn) },
  nativeImage: { createFromDataURL: (url: string) => ({ url }) },
  Notification: FakeNotification
}))

const { cleanBadgeCount, cleanNotification, setupNotifications } = await import('./notifications')

function fakeWindow(focused = false) {
  const focusListeners: Array<() => void> = []
  return {
    isMinimized: vi.fn(() => true),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    isFocused: vi.fn(() => focused),
    setOverlayIcon: vi.fn(),
    flashFrame: vi.fn(),
    once: vi.fn((_e: string, fn: () => void) => focusListeners.push(fn)),
    webContents: { send: vi.fn() },
    gainFocus: () => focusListeners.splice(0).forEach((fn) => fn())
  }
}

const realPlatform = process.platform
const setPlatform = (p: string): void => {
  Object.defineProperty(process, 'platform', { value: p })
}

beforeEach(() => {
  handlers.clear()
  shown.length = 0
  app.setBadgeCount.mockClear()
})
afterEach(() => setPlatform(realPlatform))

describe('validação', () => {
  it('aceita só título/texto e alvos conhecidos; corta o tamanho', () => {
    expect(cleanNotification(null)).toBeNull()
    expect(cleanNotification({ title: '  ', body: 'x' })).toBeNull()
    expect(cleanNotification({ title: 'Ana', body: 5 })).toBeNull()
    expect(cleanNotification({ title: 'Ana', body: 'oi', target: { kind: 'dm', channelId: 'c1' }, silent: true })).toEqual({
      title: 'Ana',
      body: 'oi',
      target: { kind: 'dm', channelId: 'c1' },
      silent: true
    })
    expect(cleanNotification({ title: 'A', body: 'b', target: { kind: 'hack' } })).toEqual({ title: 'A', body: 'b', silent: false })
    expect(cleanNotification({ title: 'x'.repeat(100), body: 'y'.repeat(500) })).toMatchObject({ title: 'x'.repeat(64), body: 'y'.repeat(200) })
  })

  it('número do selo: inteiro de 0 a 999', () => {
    expect([cleanBadgeCount(3.7), cleanBadgeCount(-1), cleanBadgeCount(5000), cleanBadgeCount('2'), cleanBadgeCount(NaN)]).toEqual([3, 0, 999, 0, 0])
  })
})

describe('notificação', () => {
  it('mostra e, no clique, restaura e foca a janela e avisa o renderer do alvo', () => {
    const win = fakeWindow()
    setupNotifications(() => win as never)
    handlers.get('notify')!({}, { title: 'Ana', body: 'oi', target: { kind: 'dm', channelId: 'c1' } })
    expect(shown).toHaveLength(1)
    expect(shown[0].options).toEqual({ title: 'Ana', body: 'oi', silent: false })
    shown[0].listeners.get('click')!()
    expect(win.restore).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
    expect(win.webContents.send).toHaveBeenCalledWith('notification-click', { kind: 'dm', channelId: 'c1' })
  })

  it('pedido inválido não mostra nada', () => {
    setupNotifications(() => null)
    handlers.get('notify')!({}, { title: '', body: '' })
    expect(shown).toHaveLength(0)
  })
})

describe('selo', () => {
  it('Windows: imagem por cima do ícone, pisca quando sobe em segundo plano e para ao focar; 0 tira', () => {
    setPlatform('win32')
    const win = fakeWindow(false)
    setupNotifications(() => win as never)
    handlers.get('badge')!({}, 2, 'data:image/png;base64,AAA')
    expect(win.setOverlayIcon).toHaveBeenCalledWith({ url: 'data:image/png;base64,AAA' }, '2 avisos')
    expect(win.flashFrame).toHaveBeenCalledWith(true)
    win.gainFocus()
    expect(win.flashFrame).toHaveBeenLastCalledWith(false)
    handlers.get('badge')!({}, 0, null)
    expect(win.setOverlayIcon).toHaveBeenLastCalledWith(null, '')
    expect(app.setBadgeCount).not.toHaveBeenCalled()
  })

  it('Windows: imagem que não é PNG em data URL é ignorada; descer não pisca', () => {
    setPlatform('win32')
    const win = fakeWindow(false)
    setupNotifications(() => win as never)
    handlers.get('badge')!({}, 3, 'file:///c:/x.png')
    expect(win.setOverlayIcon).toHaveBeenCalledWith(null, '3 avisos')
    win.flashFrame.mockClear()
    handlers.get('badge')!({}, 1, 'data:image/png;base64,B')
    expect(win.flashFrame).not.toHaveBeenCalled()
  })

  it('macOS/Linux: número do próprio sistema', () => {
    setPlatform('darwin')
    setupNotifications(() => fakeWindow() as never)
    handlers.get('badge')!({}, 4, null)
    expect(app.setBadgeCount).toHaveBeenCalledWith(4)
  })
})

describe('alvo de canal (menção, B19)', () => {
  it('aceita { kind: "channel", channelId }', () => {
    expect(cleanNotification({ title: 'Ana em #geral', body: '@Eu', target: { kind: 'channel', channelId: 'c1' } })).toMatchObject({
      target: { kind: 'channel', channelId: 'c1' }
    })
    expect(cleanNotification({ title: 'A', body: 'b', target: { kind: 'channel', channelId: 'x'.repeat(65) } })).not.toHaveProperty('target')
  })
})
