// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_THEME, type ThemeConfig } from '@shared/types'
import { applyTheme, glassActive, loadLocalTheme, LOCAL_THEME_KEY, saveLocalTheme, translucencyEnv } from './apply'
import { deriveTokens } from './derive'

const ocean: ThemeConfig = { base: 'escuro', accent: '#38bdf8', background: { stops: ['#0c2a4a', '#1fa2b8'], angle: 180 }, intensity: 70 }
const root = document.documentElement

beforeEach(() => {
  root.removeAttribute('style')
  root.className = ''
  localStorage.clear()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

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

describe('tema translúcido (vidro)', () => {
  const glassTheme: ThemeConfig = { ...ocean, translucent: true }

  it('com o sistema suportando: pede o vidro à janela, superfícies com transparência e marca o <html>', () => {
    const set = vi.fn()
    vi.spyOn(translucencyEnv, 'bridge').mockReturnValue({ supported: true, set })
    applyTheme(glassTheme, { animate: false })
    expect(set).toHaveBeenLastCalledWith({ glass: true, scheme: 'dark' })
    expect(root.dataset.translucent).toBe('true')
    expect(root.style.getPropertyValue('--sidebar')).toHaveLength(9)
    expect(root.style.getPropertyValue('--popover')).toHaveLength(9)
    expect(root.style.getPropertyValue('--border')).toHaveLength(7)
    applyTheme({ ...ocean, base: 'claro' }, { animate: false })
    expect(set).toHaveBeenLastCalledWith({ glass: false, scheme: 'light' })
    expect(root.dataset.translucent).toBeUndefined()
    expect(root.style.getPropertyValue('--sidebar')).toHaveLength(7)
  })

  it('"reduzir transparência" do sistema: tema opaco mesmo com o efeito disponível', () => {
    const set = vi.fn()
    vi.spyOn(translucencyEnv, 'bridge').mockReturnValue({ supported: true, set })
    vi.spyOn(translucencyEnv, 'reducedTransparency').mockReturnValue(true)
    applyTheme(glassTheme, { animate: false })
    expect(set).toHaveBeenLastCalledWith({ glass: false, scheme: 'dark' })
    expect(root.dataset.translucent).toBeUndefined()
    expect(root.style.getPropertyValue('--sidebar')).toHaveLength(7)
    expect(glassActive(glassTheme)).toBe(false)
  })

  it('sistema sem o efeito (ou navegador): tema opaco, sem marcar o <html>', () => {
    const set = vi.fn()
    vi.spyOn(translucencyEnv, 'bridge').mockReturnValue({ supported: false, set })
    applyTheme(glassTheme, { animate: false })
    expect(set).toHaveBeenLastCalledWith({ glass: false, scheme: 'dark' })
    expect(root.dataset.translucent).toBeUndefined()
    vi.spyOn(translucencyEnv, 'bridge').mockReturnValue(null)
    expect(() => applyTheme(glassTheme, { animate: false })).not.toThrow()
    expect(glassActive(glassTheme)).toBe(false)
  })

  it('overlay em jogos (windowEffects: false): não mexe no vidro da janela', () => {
    const set = vi.fn()
    vi.spyOn(translucencyEnv, 'bridge').mockReturnValue({ supported: true, set })
    applyTheme(glassTheme, { animate: false, windowEffects: false })
    expect(set).not.toHaveBeenCalled()
    expect(root.dataset.translucent).toBeUndefined()
  })
})
