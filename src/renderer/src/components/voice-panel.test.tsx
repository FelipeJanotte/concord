// @vitest-environment jsdom
// Controles da voz fora da sala: o painel "Voz conectada" (em cima da conta, em qualquer tela, como no
// chat de texto) tem câmera, compartilhar a tela e efeitos sonoros, e o seletor de tela / a janela de
// sons abrem dali (ficam montados no UserPanel, não só na sala).
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, User } from '@shared/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { UserPanel, VoiceStatusPanel } from '@/components/UserPanel'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'

const me: User = { id: 'eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#000', avatarUrl: null }
const sala: Channel = { id: 'sala', name: 'Jogos', type: 'voice', createdAt: 0 }

function renderPanels(): void {
  render(
    <TooltipProvider>
      <VoiceStatusPanel />
      <UserPanel />
    </TooltipProvider>
  )
}

beforeEach(() => {
  // a dica (Radix Tooltip) abre ao passar o mouse e mede com ResizeObserver, que o jsdom não tem
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
  useApp.setState({
    ...initialState,
    self: me,
    users: [me],
    channels: [sala],
    voice: [{ userId: 'eu', channelId: 'sala', muted: false, deafened: false, sharing: false }],
    myVoiceChannelId: 'sala',
    soundsLoaded: true
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (window as unknown as { api?: unknown }).api
})

describe('"Voz conectada" fora da sala', () => {
  it('mostra câmera, compartilhar a tela e efeitos sonoros (além de configurações e desconectar)', () => {
    renderPanels()
    expect(screen.getByText('Voz conectada')).toBeTruthy()
    for (const name of ['Ligar a câmera', 'Compartilhar a tela', 'Efeitos sonoros', 'Configurações de voz', 'Desconectar']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
  })

  it('fora de uma sala: nada', () => {
    useApp.setState({ myVoiceChannelId: null })
    renderPanels()
    expect(screen.queryByText('Voz conectada')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Compartilhar a tela' })).toBeNull()
  })

  it('respeita as permissões: sem video não há câmera; sem share não há tela', () => {
    useApp.setState({ voiceCanVideo: false, voiceCanShare: false })
    renderPanels()
    expect(screen.queryByRole('button', { name: 'Ligar a câmera' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Compartilhar a tela' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Efeitos sonoros' })).toBeTruthy()
  })

  it('câmera: liga pelo painel e mostra ligada', async () => {
    const setCamera = vi.spyOn(voice, 'setCamera').mockResolvedValue()
    renderPanels()
    await userEvent.click(screen.getByRole('button', { name: 'Ligar a câmera' }))
    expect(setCamera).toHaveBeenCalledWith(true)
    act(() => useApp.setState({ cameraOn: true }))
    expect(screen.getByRole('button', { name: 'Desligar a câmera' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('compartilhar a tela abre o seletor de tela daqui (no app)', async () => {
    ;(window as unknown as { api: unknown }).api = { platform: 'win32', screen: { getSources: vi.fn(async () => []), select: vi.fn(), canShareAudio: false } }
    renderPanels()
    await userEvent.click(screen.getByRole('button', { name: 'Compartilhar a tela' }))
    expect(useApp.getState().screenPickerOpen).toBe(true)
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('compartilhando: o botão fica ligado e para de compartilhar', async () => {
    const stop = vi.spyOn(voice, 'stopScreenShare').mockResolvedValue()
    useApp.setState({ sharing: true })
    renderPanels()
    const btn = screen.getByRole('button', { name: 'Parar de compartilhar' })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(btn)
    expect(stop).toHaveBeenCalled()
  })

  it('efeitos sonoros abre o popup de sons daqui', async () => {
    renderPanels()
    await userEvent.click(screen.getByRole('button', { name: 'Efeitos sonoros' }))
    expect(await screen.findByRole('dialog', { name: 'Efeitos sonoros' })).toBeTruthy()
  })
})
