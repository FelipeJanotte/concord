// @vitest-environment jsdom
// Pressione para falar na tela (B20): seção das Configurações de voz e indicador na sala.
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PushToTalkBridge } from '@shared/push-to-talk'
import { pttEnv } from '@/lib/actions/push-to-talk'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { PushToTalkHint, PushToTalkSettings } from './PushToTalk'

const bridge: PushToTalkBridge = {
  setConfig: vi.fn(),
  capture: vi.fn(async () => ({ kind: 'key' as const, code: 57, label: 'Espaço' })),
  onChange: () => () => {},
  onUnavailable: () => () => {}
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(pttEnv, 'bridge').mockReturnValue(bridge)
  vi.spyOn(voice, 'setMicGate').mockImplementation(() => {})
  useApp.setState({ ...initialState })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Configurações de voz', () => {
  it('liga o modo e troca a tecla', async () => {
    render(<PushToTalkSettings />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pressione para falar' }))
    expect(useApp.getState().pushToTalk).toBe(true)
    expect(screen.getByText('V')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Trocar tecla' }))
    expect(await screen.findByText('Espaço')).toBeTruthy()
    expect(useApp.getState().pttBinding.code).toBe(57)
  })

  it('escolhendo a tecla: botão espera e explica', () => {
    useApp.setState({ pttCapturing: true })
    render(<PushToTalkSettings />)
    expect(screen.getByRole('button', { name: 'Pressione uma tecla...' })).toHaveProperty('disabled', true)
    expect(screen.getByText(/Esc desiste/)).toBeTruthy()
  })

  it('fora do app instalado: desabilitado com aviso', () => {
    useApp.setState({ pttAvailable: false })
    render(<PushToTalkSettings />)
    expect(screen.getByRole('checkbox', { name: 'Pressione para falar' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Disponível só no app instalado.')).toBeTruthy()
  })
})

describe('indicador na sala', () => {
  it('some com o modo desligado; lembra a tecla; acende com ela pressionada', () => {
    const { container, rerender } = render(<PushToTalkHint />)
    expect(container.textContent).toBe('')
    useApp.setState({ pushToTalk: true })
    rerender(<PushToTalkHint />)
    expect(screen.getByRole('status', { name: 'Pressione V para falar' })).toBeTruthy()
    useApp.setState({ pttPressed: true })
    rerender(<PushToTalkHint />)
    expect(screen.getByRole('status', { name: 'Microfone aberto' })).toBeTruthy()
  })

  it('silenciado, a tecla pressionada não mostra "Microfone aberto"', () => {
    useApp.setState({ pushToTalk: true, pttPressed: true, muted: true })
    render(<PushToTalkHint />)
    expect(screen.getByRole('status', { name: 'Você está silenciado' })).toBeTruthy()
  })
})
