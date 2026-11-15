// @vitest-environment jsdom
// Configurações → "Aparência" (B12): galeria, editor ao vivo, temas salvos, compartilhar por código e como chegar pelo painel.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_THEME, encodeThemeCode, type PreferencesUpdate, type SavedTheme, type ThemeConfig } from '@shared/types'
import { UserPanel } from '@/components/UserPanel'
import { TooltipProvider } from '@/components/ui/tooltip'
import { flushPendingTheme } from '@/lib/client'
import { setSocket } from '@/lib/core'
import { translucencyEnv } from '@/lib/theme/apply'
import { THEME_PRESETS } from '@/lib/theme/presets'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { AppearanceSettings } from './AppearanceSettings'

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const ocean = THEME_PRESETS.find((p) => p.id === 'oceano')!.theme
const mine: SavedTheme = { id: '11111111-1111-4111-8111-111111111111', name: 'Meu roxo', theme: { ...ocean, accent: '#9775fa' } }

let socket: FakeSocket
/** O servidor devolve o que recebeu (como o de verdade faz depois de validar). */
function serverEchoes(): void {
  socket.replyTo('preferences:update', (u) => {
    const update = u as PreferencesUpdate
    const st = useApp.getState()
    return { ok: true, preferences: { theme: update.theme ?? st.theme, savedThemes: update.savedThemes ?? st.savedThemes } }
  })
}

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  useApp.setState({ ...initialState, preferencesLoaded: true })
  document.documentElement.removeAttribute('style')
  serverEchoes()
})
afterEach(async () => {
  cleanup()
  await flushPendingTheme().catch(() => {})
  setSocket(null)
})

const open = () => render(<AppearanceSettings />)
const theme = (): ThemeConfig => useApp.getState().theme
const sentUpdates = (): PreferencesUpdate[] => socket.sent('preferences:update').map((a) => a[0] as PreferencesUpdate)

describe('galeria e editor', () => {
  it('mostra todos os temas prontos; clicar aplica na hora e marca o escolhido', async () => {
    open()
    for (const p of THEME_PRESETS) expect(screen.getByRole('button', { name: p.name })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Padrão' }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: 'Oceano' }))
    expect(theme()).toEqual(ocean)
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(ocean.accent)
    expect(screen.getByRole('button', { name: 'Oceano' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('ajustes do editor mudam o tema ao vivo: base, destaque, cores do gradiente, ângulo e intensidade', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Base clara' }))
    expect(theme().base).toBe('claro')
    fireEvent.change(screen.getByLabelText('Cor de destaque'), { target: { value: '#ff8800' } })
    expect(theme().accent).toBe('#ff8800')
    await userEvent.click(screen.getByRole('button', { name: /Cor$/ }))
    expect(theme().background.stops).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('Cor 2 do gradiente'), { target: { value: '#00aa55' } })
    expect(theme().background.stops[1]).toBe('#00aa55')
    await userEvent.click(screen.getByRole('button', { name: 'Tirar a cor 1' }))
    expect(theme().background.stops).toEqual(['#00aa55'])
    fireEvent.change(screen.getByLabelText('Ângulo do gradiente'), { target: { value: '45' } })
    fireEvent.change(screen.getByLabelText('Intensidade do gradiente'), { target: { value: '80' } })
    expect(theme().background.angle).toBe(45)
    expect(theme().intensity).toBe(80)
  })

  it('várias mudanças viram um envio só ao sair da seção (com o tema final)', async () => {
    const { unmount } = open()
    await userEvent.click(screen.getByRole('button', { name: 'Oceano' }))
    await userEvent.click(screen.getByRole('button', { name: 'Neon' }))
    expect(sentUpdates()).toEqual([])
    unmount() // trocar de seção ou fechar as Configurações
    await waitFor(() => expect(sentUpdates()).toHaveLength(1))
    expect(sentUpdates()[0]).toEqual({ theme: THEME_PRESETS.find((p) => p.id === 'neon')!.theme })
  })
})

describe('meus temas', () => {
  it('salvar com nome manda a lista nova; sem nome mostra o erro', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar tema' }))
    expect(screen.getByRole('alert').textContent).toBe('Dê um nome de 1 a 32 caracteres')
    await userEvent.type(screen.getByLabelText('Nome do tema'), 'Meu padrão')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar tema' }))
    await waitFor(() => expect(useApp.getState().savedThemes).toHaveLength(1))
    expect(sentUpdates().at(-1)?.savedThemes?.[0]).toMatchObject({ name: 'Meu padrão', theme: DEFAULT_THEME })
    expect(screen.getByRole('button', { name: 'Meu padrão' })).toBeTruthy()
  })

  it('usar, duplicar e apagar um tema salvo', async () => {
    useApp.setState({ savedThemes: [mine] })
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Meu roxo' }))
    expect(theme()).toEqual(mine.theme)
    await userEvent.click(screen.getByRole('button', { name: 'Duplicar Meu roxo' }))
    await waitFor(() => expect(useApp.getState().savedThemes.map((t) => t.name)).toEqual(['Meu roxo', 'Meu roxo (cópia)']))
    await userEvent.click(screen.getByRole('button', { name: 'Apagar Meu roxo' }))
    await waitFor(() => expect(useApp.getState().savedThemes.map((t) => t.name)).toEqual(['Meu roxo (cópia)']))
  })

  it('erro do servidor aparece na tela', async () => {
    socket.replyTo('preferences:update', () => ({ ok: false, error: 'No máximo 10 temas salvos' }))
    open()
    await userEvent.type(screen.getByLabelText('Nome do tema'), 'X{Enter}')
    expect((await screen.findByRole('alert')).textContent).toBe('No máximo 10 temas salvos')
  })
})

describe('compartilhar', () => {
  it('mostra e copia o código do tema atual', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    useApp.setState({ theme: ocean })
    open()
    expect((screen.getByLabelText('Código do tema atual') as HTMLInputElement).value).toBe(encodeThemeCode(ocean))
    await userEvent.click(screen.getByRole('button', { name: /Copiar$/ }))
    expect(writeText).toHaveBeenCalledWith(encodeThemeCode(ocean))
    expect(useApp.getState().notice?.kind).toBe('info')
  })

  it('colar o código de um amigo aplica o tema; código inválido mostra o erro', async () => {
    open()
    const input = screen.getByLabelText('Código de tema para usar')
    await userEvent.type(input, 'qualquer coisa')
    await userEvent.click(screen.getByRole('button', { name: 'Usar código' }))
    expect(screen.getByRole('alert').textContent).toContain('Código de tema inválido')
    await userEvent.clear(input)
    fireEvent.change(input, { target: { value: `  ${encodeThemeCode(ocean)}  ` } })
    await userEvent.click(screen.getByRole('button', { name: 'Usar código' }))
    expect(theme()).toEqual(ocean)
  })
})

describe('painel do usuário', () => {
  it('fica nas Configurações: engrenagem do painel → "Aparência" (sem botão de paleta separado)', async () => {
    useApp.setState({ self: { id: 's', accountId: 'me', name: 'Eu', tag: 'eu1', color: '#000000', avatarUrl: null } })
    render(
      <TooltipProvider>
        <UserPanel />
      </TooltipProvider>
    )
    expect(screen.queryByRole('button', { name: 'Aparência' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Configurações' }))
    const dialog = await screen.findByRole('dialog', { name: 'Configurações' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aparência' }))
    expect(within(dialog).getByText('Temas prontos')).toBeTruthy()
  })
})

describe('Surpreenda-me e vidro', () => {
  it('"Surpreenda-me" aplica na hora um tema novo e válido (diferente do atual)', async () => {
    open()
    const before = theme()
    await userEvent.click(screen.getByRole('button', { name: /Surpreenda-me/ }))
    expect(theme()).not.toEqual(before)
    expect(theme().background.stops.length).toBeGreaterThanOrEqual(2)
  })

  it('"Translúcido (vidro)" liga e desliga o vidro no tema; sem suporte no sistema, avisa que aqui fica opaco', async () => {
    const restore = vi.spyOn(translucencyEnv, 'bridge').mockReturnValue({ supported: false, set: () => {} })
    try {
      open()
      const box = screen.getByRole('checkbox', { name: 'Translúcido (vidro)' }) as HTMLInputElement
      expect(box.checked).toBe(false)
      await userEvent.click(box)
      expect(theme().translucent).toBe(true)
      expect(screen.getByText(/O vidro precisa do Windows 11/)).toBeTruthy()
      await userEvent.click(box)
      expect(theme()).not.toHaveProperty('translucent')
      expect(screen.queryByText(/O vidro precisa do Windows 11/)).toBeNull()
    } finally {
      restore.mockRestore()
    }
  })

  it('com suporte, sem aviso; os temas prontos "Vidro" aparecem na galeria', async () => {
    const restore = vi.spyOn(translucencyEnv, 'bridge').mockReturnValue({ supported: true, set: () => {} })
    try {
      open()
      await userEvent.click(screen.getByRole('button', { name: 'Vidro' }))
      expect(theme().translucent).toBe(true)
      expect(screen.queryByText(/O vidro precisa do Windows 11/)).toBeNull()
      expect(screen.getByRole('button', { name: 'Vidro claro' })).toBeTruthy()
    } finally {
      restore.mockRestore()
    }
  })
})
