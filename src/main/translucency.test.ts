// Tema translúcido (vidro): quando o sistema tem o efeito e o que a janela recebe.
import { describe, expect, it, vi } from 'vitest'
import { supportsTranslucency, WINDOWS_ACRYLIC_BUILD } from '../shared/translucency'

vi.mock('electron', () => ({ BrowserWindow: class {}, ipcMain: { on: vi.fn() } }))

const { applyTranslucency, OPAQUE_WINDOW_COLOR } = await import('./translucency')

const fakeWindow = () => ({ setBackgroundMaterial: vi.fn(), setVibrancy: vi.fn(), setBackgroundColor: vi.fn() })

describe('supportsTranslucency', () => {
  it('Windows 11 22H2 ou mais novo e macOS sim; Windows 10, Linux e lixo não', () => {
    expect(supportsTranslucency('win32', `10.0.${WINDOWS_ACRYLIC_BUILD}`)).toBe(true)
    expect(supportsTranslucency('win32', '10.0.26100')).toBe(true)
    expect(supportsTranslucency('win32', '10.0.22000')).toBe(false) // Windows 11 21H2
    expect(supportsTranslucency('win32', '10.0.19045')).toBe(false) // Windows 10
    expect(supportsTranslucency('win32', 'qualquer')).toBe(false)
    expect(supportsTranslucency('darwin', '23.1.0')).toBe(true)
    expect(supportsTranslucency('linux', '6.5.0')).toBe(false)
  })
})

describe('applyTranslucency', () => {
  it('Windows 11: acrílico e janela transparente; desligar volta ao opaco', () => {
    const win = fakeWindow()
    expect(applyTranslucency(win, true, 'win32', '10.0.22631')).toBe(true)
    expect(win.setBackgroundMaterial).toHaveBeenLastCalledWith('acrylic')
    expect(win.setBackgroundColor).toHaveBeenLastCalledWith('#00000000')
    applyTranslucency(win, false, 'win32', '10.0.22631')
    expect(win.setBackgroundMaterial).toHaveBeenLastCalledWith('none')
    expect(win.setBackgroundColor).toHaveBeenLastCalledWith(OPAQUE_WINDOW_COLOR)
  })

  it('macOS: vibrancy', () => {
    const win = fakeWindow()
    applyTranslucency(win, true, 'darwin', '23.0.0')
    expect(win.setVibrancy).toHaveBeenLastCalledWith('under-window')
    applyTranslucency(win, false, 'darwin', '23.0.0')
    expect(win.setVibrancy).toHaveBeenLastCalledWith(null)
  })

  it('sistema sem o efeito: não mexe na janela', () => {
    const win = fakeWindow()
    expect(applyTranslucency(win, true, 'win32', '10.0.19045')).toBe(false)
    expect(applyTranslucency(win, true, 'linux', '6.5.0')).toBe(false)
    expect(win.setBackgroundMaterial).not.toHaveBeenCalled()
    expect(win.setBackgroundColor).not.toHaveBeenCalled()
  })
})
