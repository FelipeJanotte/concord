import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThumbarButton } from '../shared/thumbar'

type Handler = (...args: unknown[]) => void
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, fn: Handler) => handlers.set(channel, fn) },
  nativeImage: {
    createFromBuffer: (buffer: Buffer, options: { scaleFactor: number }) => ({ bytes: buffer.toString(), scaleFactor: options.scaleFactor })
  }
}))

const { cleanThumbarButtons, setupThumbar } = await import('./thumbar')

const png = (text: string): string => `data:image/png;base64,${Buffer.from(text).toString('base64')}`
const button = (action: ThumbarButton['action'], tooltip: string = action): ThumbarButton => ({ action, tooltip, icon: png(action) })

interface ElectronThumbarButton {
  tooltip: string
  icon: { bytes: string; scaleFactor: number }
  click: () => void
}

function fakeWindow(visible = true) {
  const showListeners: Array<() => void> = []
  const win = {
    visible,
    isVisible: () => win.visible,
    once: (event: string, fn: () => void) => {
      if (event === 'show') showListeners.push(fn)
    },
    show: () => {
      win.visible = true
      showListeners.splice(0).forEach((fn) => fn())
    },
    setThumbarButtons: vi.fn((_buttons: ElectronThumbarButton[]) => true),
    webContents: { send: vi.fn() }
  }
  return win
}

const realPlatform = process.platform
const setPlatform = (p: string): void => {
  Object.defineProperty(process, 'platform', { value: p })
}

beforeEach(() => handlers.clear())
afterEach(() => setPlatform(realPlatform))

describe('cleanThumbarButtons', () => {
  it('aceita os três botões conhecidos com dica e ícone PNG', () => {
    const buttons = [button('mute', 'Silenciar'), button('deafen', 'Desativar áudio'), button('leave', 'Sair da chamada')]
    expect(cleanThumbarButtons(buttons)).toEqual(buttons)
  })

  it('lista vazia tira os botões; o que não é lista também', () => {
    expect(cleanThumbarButtons([])).toEqual([])
    expect(cleanThumbarButtons('botões')).toEqual([])
    expect(cleanThumbarButtons(null)).toEqual([])
  })

  it('descarta ação desconhecida, ícone que não é PNG, dica vazia e ação repetida', () => {
    const raw = [
      button('mute'),
      { action: 'apagar', tooltip: 'x', icon: png('x') },
      { action: 'deafen', tooltip: 'x', icon: 'data:image/svg+xml,<svg/>' },
      { action: 'leave', tooltip: '  ', icon: png('x') },
      button('mute', 'de novo')
    ]
    expect(cleanThumbarButtons(raw)).toEqual([button('mute')])
  })

  it('corta a dica longa', () => {
    const [cleaned] = cleanThumbarButtons([button('mute', 'a'.repeat(200))])
    expect(cleaned?.tooltip).toHaveLength(64)
  })
})

describe('setupThumbar', () => {
  it('no Windows põe os botões na miniatura com o ícone em 2x e o clique avisa o app da ação', () => {
    setPlatform('win32')
    const win = fakeWindow()
    setupThumbar(() => win as never)
    handlers.get('thumbar-buttons')?.({}, [button('mute', 'Silenciar'), button('leave', 'Sair da chamada')])

    const applied = win.setThumbarButtons.mock.calls[0]?.[0] ?? []
    expect(applied.map((b) => b.tooltip)).toEqual(['Silenciar', 'Sair da chamada'])
    expect(applied[0]?.icon).toEqual({ bytes: 'mute', scaleFactor: 2 })
    applied[1]?.click()
    expect(win.webContents.send).toHaveBeenCalledWith('thumbar-click', 'leave')
  })

  it('lista vazia tira os botões', () => {
    setPlatform('win32')
    const win = fakeWindow()
    setupThumbar(() => win as never)
    handlers.get('thumbar-buttons')?.({}, [])
    expect(win.setThumbarButtons).toHaveBeenCalledWith([])
  })

  it('com a janela escondida espera ela aparecer e aplica só a última lista', () => {
    setPlatform('win32')
    const win = fakeWindow(false)
    setupThumbar(() => win as never)
    handlers.get('thumbar-buttons')?.({}, [])
    handlers.get('thumbar-buttons')?.({}, [button('mute', 'Silenciar')])
    expect(win.setThumbarButtons).not.toHaveBeenCalled()

    win.show()
    expect(win.setThumbarButtons).toHaveBeenCalledTimes(1)
    expect(win.setThumbarButtons.mock.calls[0]?.[0].map((b) => b.tooltip)).toEqual(['Silenciar'])
  })

  it('fora do Windows não mexe na janela', () => {
    setPlatform('darwin')
    const win = fakeWindow()
    setupThumbar(() => win as never)
    handlers.get('thumbar-buttons')?.({}, [button('mute')])
    expect(win.setThumbarButtons).not.toHaveBeenCalled()
  })

  it('sem janela não quebra', () => {
    setPlatform('win32')
    setupThumbar(() => null)
    expect(() => handlers.get('thumbar-buttons')?.({}, [button('mute')])).not.toThrow()
  })
})
