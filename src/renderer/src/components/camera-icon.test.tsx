// @vitest-environment jsdom
// Ícone do botão de câmera (sala e "Voz conectada"): desligada mostra a câmera riscada (VideoOff),
// ligada mostra a câmera normal (Video), como o microfone e o áudio.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, User } from '@shared/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { VoiceStatusPanel } from '@/components/UserPanel'
import { initialState, useApp } from '@/store'
import { VoiceView } from './VoiceView'

const me: User = { id: 'eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#000', avatarUrl: null }
const sala: Channel = { id: 'sala', name: 'Sala de Voz', type: 'voice', createdAt: 0 }

const views = {
  VoiceView: () => <VoiceView channelId="sala" />,
  VoiceStatusPanel: () => <VoiceStatusPanel />
}

beforeEach(() => {
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
    myVoiceChannelId: 'sala'
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe.each(Object.entries(views))('ícone da câmera em %s', (_name, View) => {
  function iconOf(label: string): { video: boolean; videoOff: boolean } {
    render(
      <TooltipProvider>
        <View />
      </TooltipProvider>
    )
    const btn = screen.getByRole('button', { name: label })
    return { video: !!btn.querySelector('svg.lucide-video'), videoOff: !!btn.querySelector('svg.lucide-video-off') }
  }

  it('desligada: câmera riscada (VideoOff)', () => {
    expect(iconOf('Ligar a câmera')).toEqual({ video: false, videoOff: true })
  })

  it('ligada: câmera normal (Video)', () => {
    useApp.setState({ cameraOn: true })
    expect(iconOf('Desligar a câmera')).toEqual({ video: true, videoOff: false })
  })
})

describe('controles da sala em tela estreita', () => {
  it('os botões redondos não encolhem e a fileira quebra linha', () => {
    useApp.setState({ voiceCanVideo: true })
    render(
      <TooltipProvider>
        <VoiceView channelId="sala" />
      </TooltipProvider>
    )
    const btn = screen.getByRole('button', { name: 'Silenciar' })
    expect(btn.className).toContain('shrink-0')
    expect(btn.parentElement?.className).toContain('flex-wrap')
  })
})
