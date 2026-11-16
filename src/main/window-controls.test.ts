import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {}, ipcMain: { on: vi.fn(), handle: vi.fn() } }))

const { runWindowControl, titleBarOptions } = await import('./window-controls')

const fakeWindow = (maximized = false) => ({
  minimize: vi.fn(),
  maximize: vi.fn(),
  unmaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: () => maximized
})

describe('runWindowControl', () => {
  it('minimizar e fechar', () => {
    const win = fakeWindow()
    runWindowControl(win, 'minimize')
    runWindowControl(win, 'close')
    expect(win.minimize).toHaveBeenCalledOnce()
    expect(win.close).toHaveBeenCalledOnce()
  })

  it('maximizar alterna: maximiza a janela normal e restaura a maximizada', () => {
    const normal = fakeWindow(false)
    runWindowControl(normal, 'maximize')
    expect(normal.maximize).toHaveBeenCalledOnce()
    expect(normal.unmaximize).not.toHaveBeenCalled()
    const maximized = fakeWindow(true)
    runWindowControl(maximized, 'maximize')
    expect(maximized.unmaximize).toHaveBeenCalledOnce()
    expect(maximized.maximize).not.toHaveBeenCalled()
  })

  it('pedido desconhecido da página: não mexe na janela', () => {
    const win = fakeWindow()
    for (const bad of ['destroy', 42, null, { action: 'close' }]) runWindowControl(win, bad)
    expect(win.minimize).not.toHaveBeenCalled()
    expect(win.maximize).not.toHaveBeenCalled()
    expect(win.close).not.toHaveBeenCalled()
  })
})

describe('titleBarOptions', () => {
  it('esconde a barra do sistema em todos; no macOS os botões de semáforo ficam alinhados com a barra do app', () => {
    expect(titleBarOptions('win32')).toEqual({ titleBarStyle: 'hidden' })
    expect(titleBarOptions('linux')).toEqual({ titleBarStyle: 'hidden' })
    expect(titleBarOptions('darwin')).toEqual({ titleBarStyle: 'hidden', trafficLightPosition: { x: 12, y: 10 } })
  })
})
