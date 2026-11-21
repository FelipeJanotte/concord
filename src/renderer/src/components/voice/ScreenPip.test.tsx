// @vitest-environment jsdom
import '@/test/ui-sdk-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@shared/types'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { ScreenPip } from './ScreenPip'

const ana = { id: 'ana', name: 'Ana' } as User
const bia = { id: 'bia', name: 'Bia' } as User

beforeEach(() => {
  localStorage.clear()
  useApp.setState({ myVoiceChannelId: null })
  useApp.setState({ ...initialState, self: { id: 'eu' } as User, users: [ana, bia], myVoiceChannelId: 'sala', screens: ['ana', 'bia'], pipScreenId: 'ana' })
  setSocket(new FakeSocket().asSocket())
  vi.spyOn(voice, 'attachScreen').mockReturnValue(() => {})
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.restoreAllMocks()
})

const pip = (): HTMLElement => screen.getByRole('region', { name: 'Miniatura: Tela de Ana' })

describe('ScreenPip', () => {
  it('sem miniatura aberta não mostra nada', () => {
    useApp.setState({ pipScreenId: null })
    render(<ScreenPip />)
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('mostra a tela escolhida', () => {
    render(<ScreenPip />)
    expect(pip()).toBeTruthy()
    expect(voice.attachScreen).toHaveBeenCalledWith('ana', expect.any(HTMLVideoElement))
  })

  it('trocar de tela vai para a próxima', async () => {
    render(<ScreenPip />)
    await userEvent.click(screen.getByRole('button', { name: 'Trocar de tela' }))
    expect(useApp.getState().pipScreenId).toBe('bia')
  })

  it('com uma tela só não oferece trocar', () => {
    useApp.setState({ screens: ['ana'] })
    render(<ScreenPip />)
    expect(screen.queryByRole('button', { name: 'Trocar de tela' })).toBeNull()
  })

  it('fechar some com a miniatura', async () => {
    render(<ScreenPip />)
    await userEvent.click(screen.getByRole('button', { name: 'Fechar miniatura' }))
    expect(useApp.getState().pipScreenId).toBeNull()
  })

  it('voltar para a sala abre a sala e fecha', async () => {
    render(<ScreenPip />)
    await userEvent.click(screen.getByRole('button', { name: 'Voltar para a sala' }))
    expect(useApp.getState()).toMatchObject({ pipScreenId: null, section: 'community', view: { kind: 'voice', channelId: 'sala' } })
  })

  it('arrastar pelo cabeçalho move e guarda a posição', () => {
    render(<ScreenPip />)
    const start = { left: pip().style.left, top: pip().style.top }
    const header = screen.getByTestId('pip-header')
    fireEvent.pointerDown(header, { clientX: 500, clientY: 400, pointerId: 1 })
    fireEvent.pointerMove(header, { clientX: 450, clientY: 350, pointerId: 1 })
    fireEvent.pointerUp(header, { clientX: 450, clientY: 350, pointerId: 1 })
    expect(pip().style.left).toBe(`${parseInt(start.left) - 50}px`)
    expect(pip().style.top).toBe(`${parseInt(start.top) - 50}px`)
    expect(JSON.parse(localStorage.getItem('concord:screen-pip')!)).toMatchObject({ x: parseInt(start.left) - 50 })
  })

  it('o canto redimensiona mantendo 16:9', () => {
    render(<ScreenPip />)
    const handle = screen.getByRole('separator', { name: 'Redimensionar a miniatura' })
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: -40, clientY: 0, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: -40, clientY: 0, pointerId: 1 })
    expect(pip().style.width).toBe('280px')
  })
})
