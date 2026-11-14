// @vitest-environment jsdom
// Controles da sala de voz conforme as permissões (v2): sem share não há botão de tela; sem speak o microfone fica cortado.
import { cleanup, render, screen } from '@testing-library/react'
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
