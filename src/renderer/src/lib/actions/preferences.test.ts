// @vitest-environment jsdom
// Tema da conta no app (v5): carregar depois do hello, sincronizar janelas, trocar (envio agrupado) e temas salvos.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_THEME, type Preferences, type SavedTheme, type ThemeConfig } from '@shared/types'
import {
  bindPreferencesEvents,
  flushPendingTheme,
  loadPreferences,
  previewTheme,
  saveThemes,
  setTheme,
  THEME_SAVE_DELAY_MS
} from '@/lib/actions/preferences'
import { setSocket } from '@/lib/core'
import { LOCAL_THEME_KEY } from '@/lib/theme/apply'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const ocean: ThemeConfig = { base: 'escuro', accent: '#38bdf8', background: { stops: ['#0c2a4a', '#1fa2b8'], angle: 180 }, intensity: 70 }
const forest: ThemeConfig = { base: 'escuro', accent: '#7bc96f', background: { stops: ['#1b3022'], angle: 90 }, intensity: 40 }
const saved: SavedTheme = { id: '11111111-1111-4111-8111-111111111111', name: 'Meu', theme: ocean }
const prefs = (theme: ThemeConfig, savedThemes: SavedTheme[] = []): Preferences => ({ theme, savedThemes })
const primary = (): string => document.documentElement.style.getPropertyValue('--primary')

let socket: FakeSocket
beforeEach(async () => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindPreferencesEvents(socket.asSocket())
  useApp.setState({ ...initialState })
  localStorage.clear()
  document.documentElement.removeAttribute('style')
})
afterEach(async () => {
  await flushPendingTheme().catch(() => {}) // não deixa envio pendente para o próximo teste
  setSocket(null)
  vi.useRealTimers()
})

describe('carregar e sincronizar', () => {
  it('loadPreferences guarda, aplica na tela e lembra na máquina', async () => {
    socket.replyTo('preferences:get', () => prefs(ocean, [saved]))
    await loadPreferences()
    expect(useApp.getState()).toMatchObject({ theme: ocean, savedThemes: [saved], preferencesLoaded: true })
    expect(primary()).toBe('#38bdf8')
    expect(JSON.parse(localStorage.getItem(LOCAL_THEME_KEY)!)).toEqual(ocean)
  })

  it('preferences:updated (outra janela) aplica o tema novo', () => {
    socket.receive('preferences:updated', prefs(forest))
    expect(useApp.getState().theme).toEqual(forest)
    expect(primary()).toBe('#7bc96f')
  })

  it('previewTheme só mostra (não muda a store nem envia)', () => {
    previewTheme(ocean)
    expect(primary()).toBe('#38bdf8')
    expect(useApp.getState().theme).toEqual(DEFAULT_THEME)
    expect(socket.sent('preferences:update')).toEqual([])
  })
})

describe('trocar o tema', () => {
  it('a tela muda na hora; mudanças seguidas viram UM envio, com o último tema', async () => {
    vi.useFakeTimers()
    socket.replyTo('preferences:update', (u) => ({ ok: true, preferences: prefs((u as { theme: ThemeConfig }).theme) }))
    setTheme(ocean)
    setTheme(forest)
    expect(primary()).toBe('#7bc96f')
    expect(useApp.getState().theme).toEqual(forest)
    expect(socket.sent('preferences:update')).toEqual([])
    await vi.advanceTimersByTimeAsync(THEME_SAVE_DELAY_MS)
    expect(socket.sent('preferences:update').map((a) => a[0])).toEqual([{ theme: forest }])
  })

  it('aviso de outra janela não desfaz a troca que ainda vai sair desta', () => {
    vi.useFakeTimers()
    socket.replyTo('preferences:update', () => ({ ok: true, preferences: prefs(forest) }))
    setTheme(forest)
    socket.receive('preferences:updated', prefs(ocean))
    expect(useApp.getState().theme).toEqual(forest)
  })

  it('tema inválido: erro, nada muda', () => {
    expect(() => setTheme({ ...ocean, accent: 'azul' })).toThrow('Tema inválido')
    expect(useApp.getState().theme).toEqual(DEFAULT_THEME)
  })

  it('servidor recusou: avisa na tela', async () => {
    socket.replyTo('preferences:update', () => ({ ok: false, error: 'Muitas mudanças seguidas' }))
    setTheme(ocean)
    await flushPendingTheme()
    expect(useApp.getState().notice?.text).toContain('Muitas mudanças seguidas')
  })
})

describe('temas salvos', () => {
  it('saveThemes substitui a lista e guarda o que o servidor devolveu; erro vira exceção', async () => {
    socket.replyTo('preferences:update', () => ({ ok: true, preferences: prefs(DEFAULT_THEME, [saved]) }))
    await expect(saveThemes([saved])).resolves.toEqual([saved])
    expect(socket.sent('preferences:update')[0][0]).toEqual({ savedThemes: [saved] })
    expect(useApp.getState().savedThemes).toEqual([saved])
    socket.replyTo('preferences:update', () => ({ ok: false, error: 'No máximo 10 temas salvos' }))
    await expect(saveThemes([])).rejects.toThrow('No máximo 10 temas salvos')
  })
})
