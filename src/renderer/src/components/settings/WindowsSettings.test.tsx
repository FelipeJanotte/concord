// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenAtLogin, StartupBridge } from '@shared/startup'
import { loadStartup, openSettings, startupEnv } from '@/lib/client'
import { initialState, useApp } from '@/store'
import { UserSettingsDialog } from './UserSettingsDialog'

const LABEL = 'Iniciar o Concord com o Windows'

function fakeBridge(initial: OpenAtLogin) {
  let system = initial
  const bridge: StartupBridge = {
    get: vi.fn(async () => system),
    enable: vi.fn(async () => (system = system.supported ? { supported: true, enabled: true } : system)),
    disable: vi.fn(async () => (system = system.supported ? { supported: true, enabled: false } : system))
  }
  return bridge
}

const nav = (): HTMLElement => screen.getByRole('navigation', { name: 'Seções das configurações' })

beforeEach(() => {
  useApp.setState({ ...initialState })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function openWindowsSection(bridge: StartupBridge | null): Promise<void> {
  vi.spyOn(startupEnv, 'bridge').mockReturnValue(bridge)
  await act(async () => loadStartup())
  render(<UserSettingsDialog />)
  act(() => openSettings('windows'))
}

describe('Iniciar com o Windows', () => {
  it('mostra a seção "Windows" com o interruptor no estado do sistema', async () => {
    await openWindowsSection(fakeBridge({ supported: true, enabled: true }))
    expect(within(nav()).getByRole('button', { name: 'Windows', current: 'page' })).toBeTruthy()
    expect((screen.getByLabelText(LABEL) as HTMLInputElement).checked).toBe(true)
  })

  it('desligar e ligar pede ao processo principal e mostra como o sistema ficou', async () => {
    const bridge = fakeBridge({ supported: true, enabled: true })
    await openWindowsSection(bridge)
    const toggle = screen.getByLabelText(LABEL) as HTMLInputElement
    await userEvent.click(toggle)
    expect(bridge.disable).toHaveBeenCalledTimes(1)
    expect(toggle.checked).toBe(false)
    expect(useApp.getState().openAtLogin).toEqual({ supported: true, enabled: false })
    await userEvent.click(toggle)
    expect(bridge.enable).toHaveBeenCalledTimes(1)
    expect(toggle.checked).toBe(true)
  })

  it('falha ao mudar: avisa e o interruptor continua como estava', async () => {
    const bridge = fakeBridge({ supported: true, enabled: true })
    vi.mocked(bridge.disable).mockRejectedValue(new Error('registro'))
    await openWindowsSection(bridge)
    const toggle = screen.getByLabelText(LABEL) as HTMLInputElement
    await userEvent.click(toggle)
    expect(toggle.checked).toBe(true)
    expect(useApp.getState().notice?.text).toBe('Não foi possível mudar o início com o Windows.')
  })

  it('sem suporte (dev, outro sistema) ou no navegador: a seção não aparece', async () => {
    await openWindowsSection(fakeBridge({ supported: false }))
    expect(within(nav()).queryByRole('button', { name: 'Windows' })).toBeNull()
    expect(screen.queryByLabelText(LABEL)).toBeNull()
    cleanup()
    useApp.setState({ ...initialState })
    await openWindowsSection(null)
    expect(within(nav()).queryByRole('button', { name: 'Windows' })).toBeNull()
  })

  it('falha ao ler o estado do sistema: a seção não aparece', async () => {
    const bridge = fakeBridge({ supported: true, enabled: true })
    vi.mocked(bridge.get).mockRejectedValue(new Error('registro'))
    await openWindowsSection(bridge)
    expect(within(nav()).queryByRole('button', { name: 'Windows' })).toBeNull()
  })
})
