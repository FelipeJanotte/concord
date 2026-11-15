// @vitest-environment jsdom
// Configurações do usuário (janela única com menu lateral): seções, abrir já numa seção, fechar, a conta
// nova do Google escolhendo o id e a rolagem (nada cortado embaixo).
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountInfo, User } from '@shared/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { UserPanel } from '@/components/UserPanel'
import { closeSettings, openDeviceSettings, openSettings } from '@/lib/client'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { UserSettingsDialog } from './UserSettingsDialog'

const self: User = { id: 's', accountId: 'acc', name: 'Eu', tag: 'eu123', color: '#000000', avatarUrl: null }
const account: AccountInfo = {
  id: 'acc',
  email: 'eu@exemplo.com',
  name: 'Eu',
  tag: 'eu123',
  color: '#000000',
  avatarUrl: null,
  hasPassword: true,
  hasGoogle: false,
  tagLocked: true
}

let socket: FakeSocket

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  useApp.setState({ ...initialState, self, account })
  vi.spyOn(voice, 'listDevices').mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const nav = (): HTMLElement => screen.getByRole('navigation', { name: 'Seções das configurações' })
const current = (): string | null => within(nav()).getByRole('button', { current: 'page' }).textContent

describe('Configurações', () => {
  it('a engrenagem do painel abre em "Minha conta", com as quatro seções no menu', async () => {
    render(
      <TooltipProvider>
        <UserPanel />
      </TooltipProvider>
    )
    await userEvent.click(screen.getByRole('button', { name: 'Configurações' }))
    expect(screen.getByRole('dialog', { name: 'Configurações' })).toBeTruthy()
    expect(within(nav()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Minha conta', 'Voz e vídeo', 'Aparência', 'Notificações'])
    expect(current()).toBe('Minha conta')
    expect(screen.getByLabelText('Nome de exibição')).toBeTruthy()
  })

  it('trocar de seção mostra o conteúdo dela', async () => {
    render(<UserSettingsDialog />)
    act(() => openSettings())
    await userEvent.click(within(nav()).getByRole('button', { name: 'Voz e vídeo' }))
    expect(current()).toBe('Voz e vídeo')
    expect(await screen.findByLabelText('Microfone')).toBeTruthy()
    await userEvent.click(within(nav()).getByRole('button', { name: 'Notificações' }))
    expect(screen.getByLabelText('Notificar mensagens de canal')).toBeTruthy()
    await userEvent.click(within(nav()).getByRole('button', { name: 'Aparência' }))
    expect(screen.getByText('Temas prontos')).toBeTruthy()
  })

  it('os botões de configurações de voz abrem direto em "Voz e vídeo"; fechar zera a seção', async () => {
    render(<UserSettingsDialog />)
    act(() => openDeviceSettings())
    expect(useApp.getState().settingsSection).toBe('voice')
    expect(current()).toBe('Voz e vídeo')
    await userEvent.keyboard('{Escape}')
    expect(useApp.getState().settingsSection).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(() => closeSettings()).not.toThrow() // fechar de novo não faz nada
  })

  it('não corta embaixo: a janela tem altura limitada e o conteúdo rola', async () => {
    render(<UserSettingsDialog />)
    act(() => openSettings('voice'))
    const dialog = screen.getByRole('dialog', { name: 'Configurações' })
    expect(dialog.className).toContain('h-[85vh]')
    const body = screen.getByTestId('settings-body')
    expect(body.className).toContain('overflow-y-auto')
    expect(body.className).toContain('min-h-0')
    expect(body.contains(await screen.findByText(/clique com o botão direito na pessoa/))).toBe(true)
  })

  it('Minha conta: Salvar só com mudança; salva pelo servidor e continua aberta', async () => {
    socket.replyTo('account:update', (u) => ({ ok: true, account: { ...account, ...(u as object) } }))
    render(<UserSettingsDialog />)
    act(() => openSettings('account'))
    const save = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    const name = screen.getByLabelText('Nome de exibição')
    await userEvent.clear(name)
    await userEvent.type(name, 'Novo Nome')
    expect(save.disabled).toBe(false)
    await userEvent.click(save)
    expect(socket.sent('account:update')[0][0]).toEqual({ name: 'Novo Nome' })
    expect(useApp.getState().account?.name).toBe('Novo Nome')
    expect(useApp.getState().settingsSection).toBe('account')
  })

  it('conta nova do Google: abre sozinha em "Escolha seu id", sem o menu', () => {
    useApp.setState({ account: { ...account, tagLocked: false, hasGoogle: true, hasPassword: false } })
    render(
      <TooltipProvider>
        <UserPanel />
      </TooltipProvider>
    )
    expect(useApp.getState().settingsSection).toBe('account')
    expect(screen.getByText('Escolha seu id')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Seções das configurações' })).toBeNull()
  })
})
