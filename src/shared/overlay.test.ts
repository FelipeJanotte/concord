import { describe, expect, it } from 'vitest'
import {
  cleanShortcut,
  cleanShortcuts,
  cleanWidth,
  DEFAULT_OVERLAY_SHORTCUTS,
  OVERLAY_MAX_WIDTH,
  OVERLAY_MIN_WIDTH,
  overlayWidth,
  shortcutFromKey,
  shortcutLabel
} from './overlay'

const key = (code: string, mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) => ({
  code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods
})

describe('shortcutFromKey', () => {
  it('combinação com modificador vira acelerador do Electron', () => {
    expect(shortcutFromKey(key('KeyO', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+O')
    expect(shortcutFromKey(key('Digit3', { altKey: true }))).toBe('Alt+3')
    expect(shortcutFromKey(key('Backquote', { shiftKey: true }))).toBe('Shift+`')
    expect(shortcutFromKey(key('Space', { metaKey: true, ctrlKey: true }))).toBe('Ctrl+Super+Space')
    expect(shortcutFromKey(key('ArrowUp', { altKey: true }))).toBe('Alt+Up')
    expect(shortcutFromKey(key('Numpad5', { ctrlKey: true }))).toBe('Ctrl+num5')
  })

  it('tecla F sozinha vale; letra sozinha, só modificador ou tecla desconhecida não', () => {
    expect(shortcutFromKey(key('F9'))).toBe('F9')
    expect(shortcutFromKey(key('KeyO'))).toBeNull()
    expect(shortcutFromKey(key('ShiftLeft', { shiftKey: true }))).toBeNull()
    expect(shortcutFromKey(key('ControlLeft', { ctrlKey: true }))).toBeNull()
    expect(shortcutFromKey(key('IntlRo', { ctrlKey: true }))).toBeNull()
  })
})

describe('cleanShortcut', () => {
  it('aceita só aceleradores que a tela gera (e os padrões)', () => {
    expect(cleanShortcut('Ctrl+Shift+O')).toBe('Ctrl+Shift+O')
    expect(cleanShortcut(DEFAULT_OVERLAY_SHORTCUTS.edit)).toBe(DEFAULT_OVERLAY_SHORTCUTS.edit)
    expect(cleanShortcut('F12')).toBe('F12')
    expect(cleanShortcut('O')).toBeNull()
    expect(cleanShortcut('Ctrl+Ctrl+O')).toBeNull()
    expect(cleanShortcut('Ctrl+Hyper+O')).toBeNull()
    expect(cleanShortcut('Ctrl+')).toBeNull()
    expect(cleanShortcut(42)).toBeNull()
    expect(cleanShortcut(`Ctrl+${'A'.repeat(100)}`)).toBeNull()
  })

  it('par inválido ou repetido volta ao padrão', () => {
    expect(cleanShortcuts({ toggle: 'Alt+1', edit: 'Alt+2' })).toEqual({ toggle: 'Alt+1', edit: 'Alt+2' })
    expect(cleanShortcuts({ toggle: 'Alt+1', edit: 'nada' })).toEqual({ toggle: 'Alt+1', edit: DEFAULT_OVERLAY_SHORTCUTS.edit })
    expect(cleanShortcuts({ toggle: 'Alt+1', edit: 'Alt+1' })).toEqual(DEFAULT_OVERLAY_SHORTCUTS)
    expect(cleanShortcuts(null)).toEqual(DEFAULT_OVERLAY_SHORTCUTS)
  })
})

describe('shortcutLabel', () => {
  it('como aparece na tela', () => {
    expect(shortcutLabel(DEFAULT_OVERLAY_SHORTCUTS.toggle)).toBe('Shift + `')
    expect(shortcutLabel(DEFAULT_OVERLAY_SHORTCUTS.edit)).toBe('Ctrl + Shift + `')
    expect(shortcutLabel('Ctrl+Super+Space')).toBe('Ctrl + Win + Espaço')
  })
})

describe('largura', () => {
  it('sem largura arrastada vale a do tamanho; com, a arrastada', () => {
    expect(overlayWidth({ size: 'small', width: null })).toBe(200)
    expect(overlayWidth({ size: 'small', width: 410 })).toBe(410)
  })

  it('cleanWidth: número finito, arredondado e preso aos limites', () => {
    expect(cleanWidth(300.6)).toBe(301)
    expect(cleanWidth(10)).toBe(OVERLAY_MIN_WIDTH)
    expect(cleanWidth(99_999)).toBe(OVERLAY_MAX_WIDTH)
    expect(cleanWidth('300')).toBeNull()
    expect(cleanWidth(Number.NaN)).toBeNull()
    expect(cleanWidth(null)).toBeNull()
  })
})
