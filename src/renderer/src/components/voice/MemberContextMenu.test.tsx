// @vitest-environment jsdom
// Menu de botão direito sobre uma pessoa: volume, silenciar e ver perfil (tile da sala e barra lateral).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, User, VoiceState } from '@shared/types'
import { ChannelSidebar } from '@/components/ChannelSidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { VoiceGrid } from './VoiceGrid'

const user = (id: string, accountId: string, name: string, tag = id): User => ({
  id,
  accountId,
  name,
  tag,
  color: '#5865f2',
  avatarUrl: null
})
const state = (userId: string): VoiceState => ({ userId, channelId: 'sala', muted: false, deafened: false, sharing: false })
const sala: Channel = { id: 'sala', name: 'Sala de Voz', type: 'voice', createdAt: 0 }

beforeEach(() => {
  useApp.setState({
    ...initialState,
    self: user('eu', 'acc-eu', 'Eu'),
    users: [user('eu', 'acc-eu', 'Eu'), user('ana', 'acc-ana', 'Ana', 'ana1')],
    channels: [sala],
    voice: [state('eu'), state('ana')],
    myVoiceChannelId: 'sala'
  })
  vi.spyOn(voice, 'setUserVolume').mockImplementation(() => {})
  vi.spyOn(voice, 'setUserMuted').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const members = (): VoiceState[] => useApp.getState().voice

function openMenuOn(element: HTMLElement): HTMLElement {
  fireEvent.contextMenu(element)
  return screen.getByRole('menu')
}

describe('na sala de voz', () => {
  it('botão direito em alguém mostra nome, volume, silenciar e perfil', () => {
    render(<VoiceGrid members={members()} />)
    const menu = openMenuOn(screen.getByText('Ana'))
    expect(within(menu).getByText('Ana')).toBeTruthy()
    expect(within(menu).getByText('#ana1')).toBeTruthy()
    expect(within(menu).getByRole('slider', { name: 'Volume de Ana' })).toBeTruthy()
    expect(within(menu).getByRole('menuitemcheckbox', { name: /Silenciar/ })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: /Ver perfil/ })).toBeTruthy()
  })

  it('em si mesmo: só o perfil (sem volume nem silenciar)', () => {
    render(<VoiceGrid members={members()} />)
    const menu = openMenuOn(screen.getByText('Eu'))
    expect(within(menu).queryByRole('slider')).toBeNull()
    expect(within(menu).queryByRole('menuitemcheckbox')).toBeNull()
    expect(within(menu).getByRole('menuitem', { name: /Ver perfil/ })).toBeTruthy()
  })

  it('o volume ajusta e mostra a porcentagem', () => {
    render(<VoiceGrid members={members()} />)
    const menu = openMenuOn(screen.getByText('Ana'))
    fireEvent.change(within(menu).getByRole('slider', { name: 'Volume de Ana' }), { target: { value: '40' } })
    expect(voice.setUserVolume).toHaveBeenCalledWith('acc-ana', 0.4)
    expect(within(menu).getByText('40%')).toBeTruthy()
  })

  it('silenciar mantém o menu aberto, guarda o volume e mostra o ícone no tile', async () => {
    useApp.setState({ userVolumes: { 'acc-ana': 0.4 } })
    render(<VoiceGrid members={members()} />)
    const menu = openMenuOn(screen.getByText('Ana'))
    await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name: /Silenciar/ }))
    expect(voice.setUserMuted).toHaveBeenCalledWith('acc-ana', true)
    expect(useApp.getState().userMuted).toEqual({ 'acc-ana': true })
    expect(useApp.getState().userVolumes).toEqual({ 'acc-ana': 0.4 })
    // continua aberto, marcado e com o volume guardado à vista
    const stillOpen = screen.getByRole('menu')
    expect(within(stillOpen).getByRole('menuitemcheckbox', { name: /Silenciar/ }).getAttribute('aria-checked')).toBe('true')
    expect(within(stillOpen).getByText('Volume (silenciado)')).toBeTruthy()
    expect(within(stillOpen).getByText('40%')).toBeTruthy()
    expect(screen.getAllByLabelText('Silenciado por você').length).toBeGreaterThan(0)

    await userEvent.click(within(stillOpen).getByRole('menuitemcheckbox', { name: /Silenciar/ }))
    expect(voice.setUserMuted).toHaveBeenLastCalledWith('acc-ana', false)
    expect(useApp.getState().userMuted).toEqual({})
  })

  it('"Ver perfil" abre o cartão com nome#tag e a sala em que a pessoa está', async () => {
    render(<VoiceGrid members={members()} />)
    const menu = openMenuOn(screen.getByText('Ana'))
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Ver perfil/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Ana#ana1')).toBeTruthy()
    expect(within(dialog).getByText('Online')).toBeTruthy()
    expect(within(dialog).getByText('Sala de Voz')).toBeTruthy()
  })
})

describe('na barra lateral', () => {
  it('botão direito em quem está na sala abre o mesmo menu', async () => {
    render(
      <TooltipProvider>
        <ChannelSidebar />
      </TooltipProvider>
    )
    const row = screen.getAllByText('Ana').find((el) => el.closest('[data-slot="context-menu-trigger"]'))!
    const menu = openMenuOn(row)
    expect(within(menu).getByRole('slider', { name: 'Volume de Ana' })).toBeTruthy()
    await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name: /Silenciar/ }))
    expect(useApp.getState().userMuted).toEqual({ 'acc-ana': true })
    act(() => {}) // re-render com o ícone
    expect(screen.getAllByLabelText('Silenciado por você').length).toBeGreaterThan(0)
  })
})

describe('equalizador automático no menu', () => {
  it('ligado: mostra quanto está aumentando ou abaixando a pessoa', () => {
    useApp.setState({ voiceLeveler: true, levelerGains: { 'acc-ana': 1.4 } })
    render(<VoiceGrid members={members()} />)
    const menu = openMenuOn(screen.getByText('Ana'))
    expect(within(menu).getByText('Equalizador: +40%')).toBeTruthy()
    act(() => useApp.setState({ levelerGains: { 'acc-ana': 0.75 } }))
    expect(within(menu).getByText('Equalizador: −25%')).toBeTruthy()
    act(() => useApp.setState({ levelerGains: {} }))
    expect(within(menu).getByText('Equalizador: sem ajuste')).toBeTruthy()
  })

  it('desligado: não mostra nada', () => {
    useApp.setState({ levelerGains: { 'acc-ana': 1.4 } })
    render(<VoiceGrid members={members()} />)
    const menu = openMenuOn(screen.getByText('Ana'))
    expect(within(menu).queryByText(/Equalizador/)).toBeNull()
  })
})
