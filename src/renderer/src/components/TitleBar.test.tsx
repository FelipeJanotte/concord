// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WindowControlsBridge } from '@shared/window-controls'
import { startWindowControls, windowEnv } from '@/lib/actions/window'
import { initialState, useApp } from '@/store'
import { TitleBar } from './TitleBar'

let maximizedListener: ((maximized: boolean) => void) | null = null
const run = vi.fn()
const off = vi.fn()

function bridge(buttons: boolean, maximized = false): WindowControlsBridge {
  return {
    buttons,
    run,
    isMaximized: () => Promise.resolve(maximized),
    onMaximizedChange: (listener) => {
      maximizedListener = listener
      return off
    }
  }
}

beforeEach(() => {
  run.mockClear()
  off.mockClear()
  maximizedListener = null
  useApp.setState({ ...initialState })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const labels = () => screen.queryAllByRole('button').map((b) => b.getAttribute('aria-label'))

describe('barra de título', () => {
  it('fora do Electron (versão web): não aparece', () => {
    vi.spyOn(windowEnv, 'bridge').mockReturnValue(null)
    const { container } = render(<TitleBar />)
    expect(container.innerHTML).toBe('')
  })

  it('Windows/Linux: minimizar, maximizar e fechar pedem a ação à janela', async () => {
    vi.spyOn(windowEnv, 'bridge').mockReturnValue(bridge(true))
    render(<TitleBar />)
    expect(labels()).toEqual(['Minimizar', 'Maximizar', 'Fechar'])
    await userEvent.click(screen.getByRole('button', { name: 'Minimizar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Maximizar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(run.mock.calls.map(([action]) => action)).toEqual(['minimize', 'maximize', 'close'])
  })

  it('janela maximizada (no início ou depois): o botão vira "Restaurar"', async () => {
    vi.spyOn(windowEnv, 'bridge').mockReturnValue(bridge(true, true))
    const stop = startWindowControls()
    render(<TitleBar />)
    expect(await screen.findByRole('button', { name: 'Restaurar' })).toBeTruthy()
    act(() => maximizedListener?.(false))
    expect(screen.getByRole('button', { name: 'Maximizar' })).toBeTruthy()
    stop()
    expect(off).toHaveBeenCalledOnce()
  })

  it('macOS: só a faixa de arrastar com o nome (os botões são os do sistema)', () => {
    vi.spyOn(windowEnv, 'bridge').mockReturnValue(bridge(false))
    render(<TitleBar />)
    expect(labels()).toEqual([])
    expect(screen.getByText('Concord')).toBeTruthy()
  })
})
