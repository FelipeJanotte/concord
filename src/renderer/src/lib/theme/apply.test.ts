// @vitest-environment jsdom
// Aplicar tema na tela: variáveis CSS no <html>, transição curta e o último tema guardado na máquina.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_THEME, type ThemeConfig } from '@shared/types'
import { applyTheme, loadLocalTheme, LOCAL_THEME_KEY, saveLocalTheme } from './apply'
import { deriveTokens } from './derive'

const ocean: ThemeConfig = { base: 'escuro', accent: '#38bdf8', background: { stops: ['#0c2a4a', '#1fa2b8'], angle: 180 }, intensity: 70 }
const root = document.documentElement

beforeEach(() => {
  root.removeAttribute('style')
  root.className = ''
  localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe('applyTheme', () => {
  it('escreve todos os tokens, o gradiente e o esquema de cores no <html>', () => {
    applyTheme(ocean, { animate: false })
    const { tokens, gradient } = deriveTokens(ocean)
    expect(root.style.getPropertyValue('--primary')).toBe('#38bdf8')
    expect(root.style.getPropertyValue('--background')).toBe(tokens.background)
    expect(root.style.getPropertyValue('--sidebar-foreground')).toBe(tokens['sidebar-foreground'])
    expect(root.style.getPropertyValue('--app-gradient')).toBe(gradient)
    expect(root.style.colorScheme).toBe('dark')
    expect(root.dataset.themeBase).toBe('escuro')
  })

  it('com animação, liga a transição só durante a troca', () => {
    vi.useFakeTimers()
    applyTheme(DEFAULT_THEME)
    expect(root.classList.contains('theme-transition')).toBe(true)
    vi.advanceTimersByTime(300)
    expect(root.classList.contains('theme-transition')).toBe(false)
    applyTheme(ocean, { animate: false })
    expect(root.classList.contains('theme-transition')).toBe(false)
  })

  it('tema padrão: sem gradiente', () => {
    applyTheme(DEFAULT_THEME, { animate: false })
    expect(root.style.getPropertyValue('--app-gradient')).toBe('none')
  })
})

describe('tema guardado na máquina', () => {
  it('salva e carrega; sem nada salvo, ou salvo inválido, volta o padrão', () => {
    expect(loadLocalTheme()).toEqual(DEFAULT_THEME)
    saveLocalTheme(ocean)
    expect(loadLocalTheme()).toEqual(ocean)
    localStorage.setItem(LOCAL_THEME_KEY, '{"base":"roxo"}')
    expect(loadLocalTheme()).toEqual(DEFAULT_THEME)
    localStorage.setItem(LOCAL_THEME_KEY, 'não é json')
    expect(loadLocalTheme()).toEqual(DEFAULT_THEME)
  })
})
