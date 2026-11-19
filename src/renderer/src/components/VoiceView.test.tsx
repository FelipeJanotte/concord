// @vitest-environment jsdom
// Controles da sala de voz conforme as permissões (v2): sem share não há botão de tela; sem speak o microfone fica cortado.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Channel, User } from '@shared/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { initialState, useApp } from '@/store'
import { VoiceView } from './VoiceView'

const me: User = { id: 'eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#000', avatarUrl: null }
const sala: Channel = { id: 'sala', name: 'Sala de Voz', type: 'voice', createdAt: 0 }

function renderView(): void {
  render(
    <TooltipProvider>
      <VoiceView channelId="sala" />
    </TooltipProvider>
  )
}

beforeEach(() => {
  useApp.setState({
    ...initialState,
    self: me,
    users: [me],
    channels: [sala],
    voice: [{ userId: 'eu', channelId: 'sala', muted: false, deafened: false, sharing: false }],
    myVoiceChannelId: 'sala'
  })
})

afterEach(cleanup)

describe('VoiceView com permissões', () => {
  it('com tudo liberado: microfone ativo e botão de tela', () => {
    renderView()
    expect(screen.getByRole('button', { name: 'Silenciar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Compartilhar a tela' })).toBeTruthy()
  })

  it('sem share: o botão de tela some', () => {
    useApp.setState({ voiceCanShare: false })
    renderView()
    expect(screen.queryByRole('button', { name: 'Compartilhar a tela' })).toBeNull()
  })

  it('sem speak: o microfone aparece cortado', () => {
    useApp.setState({ voiceCanSpeak: false })
    renderView()
    expect(screen.getByRole('button', { name: 'Ativar microfone' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Silenciar' })).toBeNull()
  })
})

describe('efeitos sonoros na sala (B17)', () => {
  it('o botão abre o popup de sons e o indicador mostra quem tocou', async () => {
    useApp.setState({
      sounds: [{ id: 's1', name: 'Buzina', emoji: '📯', durationMs: 2000, uploaderId: null, url: '/sounds/s1' }],
      soundsLoaded: true,
      soundsPlaying: { 'acc-ana': { soundId: 's1', by: 'Ana', until: Date.now() + 2000 } }
    })
    render(
      <TooltipProvider>
        <VoiceView channelId="sala" />
      </TooltipProvider>
    )
    expect(screen.getByText('📯 Ana tocou Buzina')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Efeitos sonoros' }))
    expect(await screen.findByRole('dialog', { name: 'Efeitos sonoros' })).toBeTruthy()
  })

  it('fora da sala: sem o botão', () => {
    useApp.setState({ myVoiceChannelId: null })
    renderView()
    expect(screen.queryByRole('button', { name: 'Efeitos sonoros' })).toBeNull()
  })
})

describe('câmera (B21)', () => {
  it('botão de câmera com a permissão video; sem ela, some', () => {
    renderView()
    expect(screen.getByRole('button', { name: 'Ligar a câmera' }).getAttribute('aria-pressed')).toBe('false')
    cleanup()
    useApp.setState({ cameraOn: true })
    renderView()
    expect(screen.getByRole('button', { name: 'Desligar a câmera' }).getAttribute('aria-pressed')).toBe('true')
    cleanup()
    useApp.setState({ voiceCanVideo: false, cameraOn: false })
    renderView()
    expect(screen.queryByRole('button', { name: 'Ligar a câmera' })).toBeNull()
  })

  it('quem está com a câmera ligada aparece em vídeo no quadro (a minha espelhada)', () => {
    useApp.setState({
      users: [me, { ...me, id: 'ana', accountId: 'acc-ana', name: 'Ana' }],
      voice: [
        { userId: 'eu', channelId: 'sala', muted: false, deafened: false, sharing: false },
        { userId: 'ana', channelId: 'sala', muted: false, deafened: false, sharing: false }
      ],
      cameras: ['eu', 'ana']
    })
    renderView()
    const ana = screen.getByLabelText('Câmera de Ana')
    expect(ana.tagName).toBe('VIDEO')
    expect(ana.className).not.toContain('-scale-x-100')
    expect(screen.getByLabelText('Sua câmera').className).toContain('-scale-x-100')
  })
})

describe('player do bot de música', () => {
  it('fica entre os membros da chamada e os controles da sala', () => {
    useApp.setState({
      musicRooms: {
        sala: {
          channelId: 'sala',
          nowPlaying: {
            id: 't1',
            title: 'Garota de Ipanema',
            artists: ['Tom Jobim'],
            coverUrl: null,
            durationMs: 200_000,
            url: 'https://open.spotify.com/track/t1',
            requestedBy: { accountId: 'acc-eu', name: 'Eu' }
          },
          queue: [],
          paused: false,
          elapsedMs: 0
        }
      }
    })
    const { container } = render(
      <TooltipProvider>
        <VoiceView channelId="sala" />
      </TooltipProvider>
    )
    const members = container.querySelector('[data-tile-grid]') as HTMLElement
    const player = screen.getByRole('region', { name: 'Tocando agora' })
    const controls = screen.getByRole('button', { name: 'Silenciar' })
    expect(members.compareDocumentPosition(player) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(player.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(members.contains(player)).toBe(false)
  })
})
