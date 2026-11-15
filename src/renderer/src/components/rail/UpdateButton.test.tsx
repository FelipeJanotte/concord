// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdaterBridge } from '@shared/updater'
import { TooltipProvider } from '@/components/ui/tooltip'
import { updatesEnv } from '@/lib/actions/updates'
import { initialState, useApp } from '@/store'
import { UtilityRail } from './UtilityRail'

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const install = vi.fn()

beforeEach(() => {
  install.mockClear()
  vi.spyOn(updatesEnv, 'bridge').mockReturnValue({ install, getStatus: vi.fn(), onStatus: vi.fn() } as unknown as UpdaterBridge)
  useApp.setState({ ...initialState })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const rail = () =>
  render(
    <TooltipProvider>
      <UtilityRail tools={[]} />
    </TooltipProvider>
  )
const labels = () => screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))

describe('botão de atualizar na barra de úteis', () => {
  it('sem atualização (em dia, procurando ou com erro): não aparece', () => {
    for (const update of [{ state: 'idle' }, { state: 'checking' }, { state: 'error', message: 'x' }] as const) {
      useApp.setState({ update })
      rail()
      expect(labels()).toEqual(['Início', 'Concord'])
      cleanup()
    }
  })

  it('baixando: aparece acima do Início com o progresso e não instala ao clicar', async () => {
    useApp.setState({ update: { state: 'downloading', version: '0.2.0', percent: 42 } })
    rail()
    expect(labels()).toEqual(['Baixando atualização (42%)', 'Início', 'Concord'])
    await userEvent.click(screen.getByRole('button', { name: 'Baixando atualização (42%)' }))
    expect(install).not.toHaveBeenCalled()
  })

  it('pronta: "Atualizar o Concord" acima do Início; clicar reinicia e instala', async () => {
    useApp.setState({ update: { state: 'ready', version: '0.2.0' } })
    rail()
    expect(labels()[0]).toBe('Atualizar o Concord')
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar o Concord' }))
    expect(install).toHaveBeenCalledOnce()
  })

  it('continua na barra mesmo depois de fechar a faixa do topo ("Depois")', () => {
    useApp.setState({ update: { state: 'ready', version: '0.2.0' }, updateDismissed: '0.2.0' })
    rail()
    expect(screen.getByRole('button', { name: 'Atualizar o Concord' })).toBeTruthy()
  })
})
