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
const check = vi.fn()

beforeEach(() => {
  install.mockClear()
  check.mockClear()
  vi.spyOn(updatesEnv, 'bridge').mockReturnValue({ install, check, getStatus: vi.fn(), onStatus: vi.fn() } as unknown as UpdaterBridge)
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
  it('sem atualização (em dia ou com erro): só o botão pequeno de procurar, no fim da barra', () => {
    for (const update of [{ state: 'idle' }, { state: 'error', message: 'x' }] as const) {
      useApp.setState({ update })
      rail()
      expect(labels()).toEqual(['Início', 'Concord', 'Procurar atualizações'])
      cleanup()
    }
  })

  it('procurar atualizações: clicar pede a verificação', async () => {
    rail()
    await userEvent.click(screen.getByRole('button', { name: 'Procurar atualizações' }))
    expect(check).toHaveBeenCalledOnce()
  })

  it('procurando: botão girando, sem novo pedido ao clicar', async () => {
    useApp.setState({ update: { state: 'checking' } })
    rail()
    await userEvent.click(screen.getByRole('button', { name: 'Procurando atualizações' }))
    expect(check).not.toHaveBeenCalled()
  })

  it('baixando ou pronta: o botão de procurar some', () => {
    useApp.setState({ update: { state: 'ready', version: '0.2.0' } })
    rail()
    expect(screen.queryByRole('button', { name: /Procura/ })).toBeNull()
  })

  it('fora do Electron (versão web): sem botão de procurar', () => {
    vi.spyOn(updatesEnv, 'bridge').mockReturnValue(null)
    rail()
    expect(labels()).toEqual(['Início', 'Concord'])
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
