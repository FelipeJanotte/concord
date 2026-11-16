// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ScreenPreviewResult, User } from '@shared/types'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { LivePreview } from './LivePreview'

const user = (id: string, name: string): User => ({ id, accountId: `acc-${id}`, name, tag: id, color: '#5865f2', avatarUrl: null })
let socket: FakeSocket

function reply(result: ScreenPreviewResult): void {
  socket.replyTo('voice:preview-get', () => result)
}

beforeEach(() => {
  useApp.setState({ ...initialState, self: user('eu', 'Eu'), users: [user('eu', 'Eu'), user('ana', 'Ana')] })
  socket = new FakeSocket()
  setSocket(socket.asSocket())
})

afterEach(() => {
  cleanup()
  setSocket(null)
})

async function hoverLive(): Promise<void> {
  render(<LivePreview userId="ana" />)
  await userEvent.hover(screen.getByText('Ao vivo'))
}

describe('LivePreview', () => {
  it('ao passar o mouse no "Ao vivo", mostra a miniatura da tela sem entrar na sala', async () => {
    reply({ ok: true, image: 'data:image/jpeg;base64,AAAA' })
    await hoverLive()
    const img = await screen.findByRole('img', { name: 'Tela de Ana' })
    expect(img.getAttribute('src')).toBe('data:image/jpeg;base64,AAAA')
    expect(socket.sent('voice:preview-get')).toEqual([['ana']])
    expect(socket.sent('voice:join')).toEqual([])
  })

  it('miniatura que ainda não chegou: avisa que já vai aparecer', async () => {
    reply({ ok: true, image: null })
    await hoverLive()
    expect(await screen.findByText('A prévia aparece em instantes.')).toBeTruthy()
  })

  it('prévia recusada: mostra o motivo', async () => {
    reply({ ok: false, error: 'Prévia indisponível' })
    await hoverLive()
    expect(await screen.findByText('Prévia indisponível')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
