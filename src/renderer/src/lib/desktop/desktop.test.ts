// @vitest-environment jsdom
import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks'
import { emit } from '@tauri-apps/api/event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import channels from '@shared/desktop-channels.json'
import type { DesktopApi, DesktopEnvironment } from '@shared/desktop-api'
import { buildDesktopApi } from './api'
import { installDesktopApi } from './install'

const environment: DesktopEnvironment = { platform: 'win32', translucencySupported: true, windowButtons: true, canShareAudio: true }

interface Call {
  command: string
  args: Record<string, unknown> | undefined
}

let calls: Call[]
let listened: string[]
let replies: Record<string, unknown>

function mockBackend(): void {
  mockIPC((command, args) => {
    if (command === 'plugin:event|listen') {
      listened.push((args as { event: string }).event)
      return 1
    }
    if (command.startsWith('plugin:event|')) return undefined
    calls.push({ command, args: args as Call['args'] })
    return replies[command]
  })
}

function lastCall(): Call {
  return calls[calls.length - 1]
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  calls = []
  listened = []
  replies = {}
  mockWindows('main')
  mockBackend()
})

afterEach(() => {
  clearMocks()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
  Reflect.deleteProperty(window, '__CONCORD_DESKTOP__')
})

describe('ambiente injetado pelo Rust', () => {
  it('campos síncronos vêm do ambiente', () => {
    const api = buildDesktopApi({ platform: 'darwin', translucencySupported: false, windowButtons: false, canShareAudio: false })
    expect(api.platform).toBe('darwin')
    expect(api.translucency.supported).toBe(false)
    expect(api.windowControls.buttons).toBe(false)
    expect(api.screen.canShareAudio).toBe(false)
  })
})

describe('comandos', () => {
  let api: DesktopApi
  beforeEach(() => {
    api = buildDesktopApi(environment)
  })

  it('googleSignIn devolve o resultado do Rust e passa o clientId em camelCase', async () => {
    replies['google_sign_in'] = { code: 'c', codeVerifier: 'v', redirectUri: 'http://127.0.0.1:1' }
    await expect(api.googleSignIn('abc')).resolves.toEqual({ code: 'c', codeVerifier: 'v', redirectUri: 'http://127.0.0.1:1' })
    expect(lastCall()).toEqual({ command: 'google_sign_in', args: { clientId: 'abc' } })
  })

  it('erro do Rust rejeita a promessa com a mensagem', async () => {
    mockIPC(() => Promise.reject('Recurso nativo ainda não implementado'))
    await expect(api.screen.getSources()).rejects.toBe('Recurso nativo ainda não implementado')
  })

  it('comandos sem resposta falham no console em vez de sumir', async () => {
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockIPC(() => Promise.reject('nativo falhou'))
    api.thumbar.setButtons([])
    await settle()
    expect(report).toHaveBeenCalledWith(expect.stringContaining('thumbar_buttons'), 'nativo falhou')
  })

  it('screen', async () => {
    replies['screen_sources'] = [{ id: 'screen:0:0', name: 'Tela', kind: 'screen', thumbnail: 't', appIcon: null }]
    await expect(api.screen.getSources()).resolves.toHaveLength(1)
    const request = { sourceId: 'screen:65537', audio: true, url: 'ws://livekit.test', token: 'jwt' }
    await api.screen.start(request)
    expect(lastCall()).toEqual({ command: 'screen_start', args: { request } })
    await api.screen.stop()
    expect(lastCall()).toEqual({ command: 'screen_stop', args: {} })
    replies['screen_preview'] = 'data:image/png;base64,AAAA'
    await expect(api.screen.preview()).resolves.toBe('data:image/png;base64,AAAA')
    expect(lastCall()).toEqual({ command: 'screen_preview', args: {} })
  })

  it('overlay (janela principal)', async () => {
    const config = { enabled: true, corner: 'top-left', size: 'medium', position: null, width: null } as const
    api.overlay.setConfig(config)
    api.overlay.setRoom(null)
    api.overlay.setEditing(true)
    api.overlay.pauseShortcuts(true)
    api.overlay.setTheme({ name: 'x' } as never)
    replies['overlay_shortcuts'] = { toggle: true, edit: false }
    await expect(api.overlay.setShortcuts({ toggle: 'F1', edit: 'F2' })).resolves.toEqual({ toggle: true, edit: false })
    await settle()
    expect(calls).toEqual([
      { command: 'overlay_config', args: { config } },
      { command: 'overlay_room', args: { room: null } },
      { command: 'overlay_edit', args: { editing: true } },
      { command: 'overlay_shortcuts_pause', args: { paused: true } },
      { command: 'overlay_theme', args: { theme: { name: 'x' } } },
      { command: 'overlay_shortcuts', args: { shortcuts: { toggle: 'F1', edit: 'F2' } } }
    ])
  })

  it('overlay (página do overlay)', async () => {
    api.overlayView.finishEditing()
    api.overlayView.resize(300, true)
    await settle()
    expect(calls).toEqual([
      { command: 'overlay_edit', args: { editing: false } },
      { command: 'overlay_resize', args: { width: 300, done: true } }
    ])
  })

  it('pressione para falar', async () => {
    const config = { enabled: true, binding: { kind: 'key', code: 47, label: 'V' } } as const
    api.pushToTalk.setConfig(config)
    replies['ptt_capture'] = { kind: 'mouse', code: 4, label: 'Botão 4 do mouse' }
    await expect(api.pushToTalk.capture()).resolves.toEqual({ kind: 'mouse', code: 4, label: 'Botão 4 do mouse' })
    expect(calls[0]).toEqual({ command: 'ptt_config', args: { config } })
  })

  it('ocioso, atualizações, início com o Windows e janela', async () => {
    replies['idle_get'] = true
    replies['update_get'] = { state: 'ready', version: '1.0.0' }
    replies['startup_get'] = null
    replies['startup_set'] = true
    replies['window_maximized_get'] = true
    await expect(api.idle.isIdle()).resolves.toBe(true)
    await expect(api.updater.getStatus()).resolves.toEqual({ state: 'ready', version: '1.0.0' })
    await expect(api.startup.get()).resolves.toBeNull()
    await expect(api.startup.set(true)).resolves.toBe(true)
    await expect(api.windowControls.isMaximized()).resolves.toBe(true)
    api.updater.check()
    api.updater.install()
    api.windowControls.run('maximize')
    api.translucency.set({ glass: true, scheme: 'dark' })
    api.notifications.show({ title: 'a', body: 'b' })
    api.notifications.setBadge(3, null)
    await settle()
    expect(calls.map((call) => call.command)).toEqual([
      'idle_get',
      'update_get',
      'startup_get',
      'startup_set',
      'window_maximized_get',
      'update_check',
      'update_install',
      'window_control',
      'window_translucency',
      'notify',
      'badge'
    ])
    expect(calls.find((call) => call.command === 'startup_set')?.args).toEqual({ openAtLogin: true })
    expect(calls.find((call) => call.command === 'window_control')?.args).toEqual({ action: 'maximize' })
    expect(calls.find((call) => call.command === 'badge')?.args).toEqual({ count: 3, overlay: null })
  })
})

describe('eventos', () => {
  it('entregam o conteúdo ao ouvinte e o cancelamento para de entregar', async () => {
    mockIPC(() => undefined, { shouldMockEvents: true })
    const api = buildDesktopApi(environment)
    const listener = vi.fn()
    const off = api.windowControls.onMaximizedChange(listener)
    await settle()
    await emit('window-maximized', true)
    expect(listener).toHaveBeenCalledWith(true)
    off()
    await settle()
    await emit('window-maximized', false)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('overlay-update chega como sala, configuração e modo de mover', async () => {
    mockIPC(() => undefined, { shouldMockEvents: true })
    const view = buildDesktopApi(environment).overlayView
    const listener = vi.fn()
    view.onUpdate(listener)
    await settle()
    const config = { enabled: true, corner: 'top-left', size: 'small', position: null, width: null }
    await emit('overlay-update', { room: null, config, editing: true })
    expect(listener).toHaveBeenCalledWith(null, config, true)
  })

  it('screen-ended entrega o motivo do fim da tela', async () => {
    mockIPC(() => undefined, { shouldMockEvents: true })
    const ended = vi.fn()
    buildDesktopApi(environment).screen.onEnded(ended)
    await settle()
    await emit('screen-ended', 'source-closed')
    expect(ended).toHaveBeenCalledWith('source-closed')
  })

  it('ppt-unavailable e notification-click', async () => {
    mockIPC(() => undefined, { shouldMockEvents: true })
    const api = buildDesktopApi(environment)
    const unavailable = vi.fn()
    const click = vi.fn()
    api.pushToTalk.onUnavailable(unavailable)
    api.notifications.onClick(click)
    await settle()
    await emit('ptt-unavailable')
    await emit('notification-click', { kind: 'friends' })
    expect(unavailable).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledWith({ kind: 'friends' })
  })
})

describe('canais compartilhados', () => {
  it('só usa comandos e eventos de desktop-channels.json', async () => {
    const api = buildDesktopApi(environment)
    const overlayConfig = { enabled: false, corner: 'top-left', size: 'medium', position: null, width: null } as const
    await Promise.allSettled([
      api.googleSignIn('x'),
      api.screen.getSources(),
      api.screen.start({ sourceId: 's', audio: false, url: 'u', token: 't' }),
      api.screen.stop(),
      api.screen.preview(),
      api.overlay.setShortcuts({ toggle: 'F1', edit: 'F2' }),
      api.pushToTalk.capture(),
      api.idle.isIdle(),
      api.updater.getStatus(),
      api.startup.get(),
      api.startup.set(false),
      api.windowControls.isMaximized()
    ])
    api.overlay.setConfig(overlayConfig)
    api.overlay.setRoom(null)
    api.overlay.setEditing(false)
    api.overlay.pauseShortcuts(false)
    api.overlay.setTheme({} as never)
    api.overlayView.finishEditing()
    api.overlayView.resize(1, false)
    api.pushToTalk.setConfig({ enabled: false, binding: null })
    api.notifications.show({ title: '', body: '' })
    api.notifications.setBadge(0, null)
    api.thumbar.setButtons([])
    api.updater.check()
    api.updater.install()
    api.translucency.set({ glass: false, scheme: 'dark' })
    api.windowControls.run('close')
    const noop = (): void => {}
    api.overlay.onToggled(noop)
    api.overlay.onEditing(noop)
    api.overlay.onMoved(noop)
    api.overlay.onResized(noop)
    api.overlayView.onUpdate(noop)
    api.overlayView.onTheme(noop)
    api.pushToTalk.onChange(noop)
    api.pushToTalk.onUnavailable(noop)
    api.idle.onChange(noop)
    api.notifications.onClick(noop)
    api.thumbar.onClick(noop)
    api.updater.onStatus(noop)
    api.windowControls.onMaximizedChange(noop)
    api.screen.onEnded(noop)
    await settle()

    const kebab = (snake: string): string => snake.replaceAll('_', '-')
    const usedCommands = new Set(calls.map((call) => kebab(call.command)))
    expect([...usedCommands].filter((name) => !channels.commands.includes(name))).toEqual([])
    expect(new Set(listened)).toEqual(new Set(channels.events))
    const unusedCommands = channels.commands.filter((name) => !usedCommands.has(name))
    expect(unusedCommands).toEqual(['show-main-window'])
  })
})

describe('installDesktopApi', () => {
  it('fora do Tauri não mexe em window.api', () => {
    clearMocks()
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    installDesktopApi()
    expect('api' in window).toBe(false)
  })

  it('dentro do Tauri monta window.api com o ambiente injetado', async () => {
    ;(window as unknown as { __CONCORD_DESKTOP__: DesktopEnvironment }).__CONCORD_DESKTOP__ = environment
    installDesktopApi()
    expect(window.api.platform).toBe('win32')
    expect(window.api.windowControls.buttons).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

  it('mostra a janela principal depois do primeiro quadro, uma vez só', async () => {
    ;(window as unknown as { __CONCORD_DESKTOP__: DesktopEnvironment }).__CONCORD_DESKTOP__ = environment
    installDesktopApi()
    expect(calls.map((call) => call.command)).not.toContain('show_main_window')
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(calls.filter((call) => call.command === 'show_main_window')).toHaveLength(1)
  })

  it('a janela do overlay não pede para mostrar a principal', async () => {
    mockWindows('overlay')
    ;(window as unknown as { __CONCORD_DESKTOP__: DesktopEnvironment }).__CONCORD_DESKTOP__ = environment
    installDesktopApi()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(calls.map((call) => call.command)).not.toContain('show_main_window')
  })

  it('sem o ambiente injetado falha alto', () => {
    expect(() => installDesktopApi()).toThrow(/__CONCORD_DESKTOP__/)
  })
})
