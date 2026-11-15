// @vitest-environment jsdom
// Atualização automática no app (A13): situação vinda da ponte, faixa "Reiniciar para atualizar",
// "Depois" e fora do Electron.
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '@shared/updater'
import { checkForUpdates, installUpdate, startUpdates, updatesEnv } from '@/lib/actions/updates'
import { initialState, useApp } from '@/store'
import { UpdateBanner } from './UpdateBanner'

let listener: ((s: UpdateStatus) => void) | null
let install: ReturnType<typeof vi.fn<() => void>>
let check: ReturnType<typeof vi.fn<() => void>>
let stop: () => void

beforeEach(() => {
  useApp.setState({ ...initialState })
  listener = null
  install = vi.fn<() => void>()
  check = vi.fn<() => void>()
  vi.spyOn(updatesEnv, 'bridge').mockReturnValue({
    getStatus: async () => ({ state: 'checking' }),
    onStatus: (fn) => {
      listener = fn
      return () => (listener = null)
    },
    install,
    check
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

  it('procurar agora: pede à ponte e, sem versão nova, avisa que já está na mais nova', () => {
    checkForUpdates()
    expect(check).toHaveBeenCalledOnce()
    act(() => listener!({ state: 'checking' }))
    act(() => listener!({ state: 'idle' }))
    expect(useApp.getState().notice).toMatchObject({ text: 'O Concord já está na versão mais nova.', kind: 'info' })
  })

  it('procurar agora com erro: mostra o motivo', () => {
    checkForUpdates()
    act(() => listener!({ state: 'error', message: 'A atualização só funciona no app instalado.' }))
    expect(useApp.getState().notice).toMatchObject({ text: 'A atualização só funciona no app instalado.', kind: 'error' })
  })

  it('verificação automática (sem clicar) não avisa; o aviso vale uma vez por clique', () => {
    act(() => listener!({ state: 'checking' }))
    act(() => listener!({ state: 'idle' }))
    expect(useApp.getState().notice).toBeNull()
    checkForUpdates()
    act(() => listener!({ state: 'downloading', version: '1.1.0', percent: 0 }))
    act(() => listener!({ state: 'idle' }))
    expect(useApp.getState().notice).toBeNull()
  })
})
