// @vitest-environment jsdom
// Atualização automática no app (A13): situação vinda da ponte, faixa "Reiniciar para atualizar",
// "Depois" e fora do Electron.
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '@shared/updater'
import { installUpdate, startUpdates, updatesEnv } from '@/lib/actions/updates'
import { initialState, useApp } from '@/store'
import { UpdateBanner } from './UpdateBanner'

let listener: ((s: UpdateStatus) => void) | null
let install: ReturnType<typeof vi.fn<() => void>>
let stop: () => void

beforeEach(() => {
  useApp.setState({ ...initialState })
  listener = null
  install = vi.fn<() => void>()
  vi.spyOn(updatesEnv, 'bridge').mockReturnValue({
    getStatus: async () => ({ state: 'checking' }),
    onStatus: (fn) => {
      listener = fn
      return () => (listener = null)
    },
    install
  })
  stop = startUpdates()
})
afterEach(() => {
  stop()
  cleanup()
  vi.restoreAllMocks()
})

describe('atualização', () => {
  it('pega a situação atual e acompanha as mudanças; parar deixa de ouvir', async () => {
    await vi.waitFor(() => expect(useApp.getState().update).toEqual({ state: 'checking' }))
    act(() => listener!({ state: 'downloading', version: '1.1.0', percent: 30 }))
    expect(useApp.getState().update).toEqual({ state: 'downloading', version: '1.1.0', percent: 30 })
    stop()
    expect(listener).toBeNull()
  })

  it('faixa só com a versão pronta; "Reiniciar para atualizar" instala', async () => {
    render(<UpdateBanner />)
    act(() => listener!({ state: 'downloading', version: '1.1.0', percent: 90 }))
    expect(screen.queryByRole('status')).toBeNull()
    act(() => listener!({ state: 'ready', version: '1.1.0' }))
    expect(screen.getByRole('status').textContent).toContain('A versão 1.1.0 do Concord está pronta.')
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar para atualizar' }))
    expect(install).toHaveBeenCalledTimes(1)
  })

  it('"Depois" esconde esta versão; uma versão mais nova aparece de novo', async () => {
    render(<UpdateBanner />)
    act(() => listener!({ state: 'ready', version: '1.1.0' }))
    await userEvent.click(screen.getByRole('button', { name: 'Depois' }))
    expect(screen.queryByRole('status')).toBeNull()
    act(() => listener!({ state: 'ready', version: '1.2.0' }))
    expect(screen.getByRole('status').textContent).toContain('1.2.0')
  })

  it('instalar sem versão pronta não faz nada; fora do Electron não quebra', () => {
    installUpdate()
    expect(install).not.toHaveBeenCalled()
    stop()
    vi.spyOn(updatesEnv, 'bridge').mockReturnValue(null)
    expect(() => startUpdates()()).not.toThrow()
  })
})
