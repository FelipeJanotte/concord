// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { LoginScreen } from './LoginScreen'

let socket: FakeSocket

beforeEach(() => {
  vi.stubGlobal('fetch', () => new Promise(() => {}))
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  useApp.setState({ ...initialState, restoring: true, status: 'connecting' })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LoginScreen entrando', () => {
  it('"Entrar com outra conta" para de esperar o servidor e mostra o formulário', async () => {
    render(<LoginScreen />)
    expect(screen.getByText('Entrando...')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com outra conta' }))
    expect(socket.connected).toBe(false)
    expect(screen.queryByText('Entrando...')).toBeNull()
    expect(useApp.getState().restoring).toBe(false)
  })
})
