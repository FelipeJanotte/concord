import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindLimitEvents, limitNotice } from '@/lib/actions/limits'
import { register } from '@/lib/client'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

beforeEach(() => {
  useApp.setState({ ...initialState })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('aviso de limite', () => {
  it('texto com os segundos arredondados para cima', () => {
    expect(limitNotice('message', 300)).toBe('Você está mandando mensagens rápido demais. Espere 1 s.')
    expect(limitNotice('message', 2500)).toBe('Você está mandando mensagens rápido demais. Espere 3 s.')
  })

  it('rate:limited vira um aviso na tela', () => {
    const socket = new FakeSocket()
    bindLimitEvents(socket.asSocket())
    socket.receive('rate:limited', { action: 'message', retryAfterMs: 1000 })
    expect(useApp.getState().notice).toMatchObject({
      kind: 'info',
      text: 'Você está mandando mensagens rápido demais. Espere 1 s.'
    })
  })
})

describe('HTTP 429 no login/cadastro', () => {
  it('mostra a mensagem do servidor (e não "erro 429")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, error: 'Muitas tentativas deste computador. Tente de novo em 600 s.' }), {
          status: 429
        })
      )
    )
    await expect(register('http://srv', { email: 'a@b.c', password: 'senha-123', name: 'Ana', tag: 'ana' })).rejects.toThrow(
      'Muitas tentativas deste computador. Tente de novo em 600 s.'
    )
  })

  it('outros erros continuam genéricos', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('falhou', { status: 500 })))
    await expect(register('http://srv', { email: 'a@b.c', password: 'senha-123', name: 'Ana', tag: 'ana' })).rejects.toThrow(
      'O servidor respondeu com erro (500)'
    )
  })
})
