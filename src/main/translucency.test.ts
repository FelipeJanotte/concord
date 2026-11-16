import { describe, expect, it, vi } from 'vitest'
import { supportsTranslucency, WINDOWS_ACRYLIC_BUILD } from '../shared/translucency'

vi.mock('electron', () => ({ BrowserWindow: class {}, ipcMain: { on: vi.fn() }, nativeTheme: {} }))

const { applyTranslucency, OPAQUE_WINDOW_COLOR } = await import('./translucency')

const fakeWindow = () => ({ setBackgroundMaterial: vi.fn(), setVibrancy: vi.fn(), setBackgroundColor: vi.fn() })
const fakeTheme = (): { themeSource: 'system' | 'light' | 'dark' } => ({ themeSource: 'system' })

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
  it('Windows 11: acrílico, janela transparente e tinta do material no esquema do tema; desligar volta ao opaco', () => {
    const win = fakeWindow()
    const theme = fakeTheme()
    expect(applyTranslucency(win, theme, { glass: true, scheme: 'dark' }, 'win32', '10.0.22631')).toBe(true)
    expect(win.setBackgroundMaterial).toHaveBeenLastCalledWith('acrylic')
    expect(win.setBackgroundColor).toHaveBeenLastCalledWith('#00000000')
    expect(theme.themeSource).toBe('dark')
    applyTranslucency(win, theme, { glass: false, scheme: 'light' }, 'win32', '10.0.22631')
    expect(win.setBackgroundMaterial).toHaveBeenLastCalledWith('none')
    expect(win.setBackgroundColor).toHaveBeenLastCalledWith(OPAQUE_WINDOW_COLOR)
    expect(theme.themeSource).toBe('light')
  })

  it('macOS: vibrancy', () => {
    const win = fakeWindow()
    applyTranslucency(win, fakeTheme(), { glass: true, scheme: 'dark' }, 'darwin', '23.0.0')
    expect(win.setVibrancy).toHaveBeenLastCalledWith('under-window')
    applyTranslucency(win, fakeTheme(), { glass: false, scheme: 'dark' }, 'darwin', '23.0.0')
    expect(win.setVibrancy).toHaveBeenLastCalledWith(null)
  })

  it('sistema sem o efeito: não mexe no material, mas o esquema segue o tema', () => {
    const win = fakeWindow()
    const theme = fakeTheme()
    expect(applyTranslucency(win, theme, { glass: true, scheme: 'light' }, 'win32', '10.0.19045')).toBe(false)
    expect(applyTranslucency(win, theme, { glass: true, scheme: 'light' }, 'linux', '6.5.0')).toBe(false)
    expect(win.setBackgroundMaterial).not.toHaveBeenCalled()
    expect(win.setBackgroundColor).not.toHaveBeenCalled()
    expect(theme.themeSource).toBe('light')
  })

  it('pedido inválido vindo da página: nada muda', () => {
    const win = fakeWindow()
    const theme = fakeTheme()
    for (const bad of [true, null, { glass: 'sim', scheme: 'dark' }, { glass: true, scheme: 'azul' }]) {
      expect(applyTranslucency(win, theme, bad, 'win32', '10.0.22631')).toBe(false)
    }
    expect(win.setBackgroundMaterial).not.toHaveBeenCalled()
    expect(theme.themeSource).toBe('system')
  })
})
