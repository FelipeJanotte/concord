import type { IncomingMessage } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { clientIp, discardBody } from './http'

const req = (remoteAddress: string | undefined, forwarded?: string | string[]): IncomingMessage =>
  ({ socket: { remoteAddress }, headers: forwarded ? { 'x-forwarded-for': forwarded } : {} }) as unknown as IncomingMessage

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('clientIp', () => {
  it('usa o IP da conexão e ignora X-Forwarded-For por padrão (não dá para forjar)', () => {
    expect(clientIp(req('10.0.0.5', '1.2.3.4'))).toBe('10.0.0.5')
  })

  it('com TRUST_PROXY=1 usa o primeiro IP do X-Forwarded-For', () => {
    vi.stubEnv('TRUST_PROXY', '1')
    expect(clientIp(req('127.0.0.1', '203.0.113.7, 10.0.0.1'))).toBe('203.0.113.7')
    expect(clientIp(req('127.0.0.1', ['198.51.100.2']))).toBe('198.51.100.2')
    expect(clientIp(req('127.0.0.1'))).toBe('127.0.0.1')
  })

  it('sem endereço nenhum', () => {
    expect(clientIp(req(undefined))).toBe('desconhecido')
  })
})

describe('discardBody', () => {
  async function feed(maxDiscard: number, sizes: number[]): Promise<boolean> {
    const body = new PassThrough()
    const destroy = vi.spyOn(body, 'destroy')
    discardBody(body as unknown as IncomingMessage, maxDiscard)
    for (const n of sizes) body.write(Buffer.alloc(n))
    await new Promise((r) => setImmediate(r))
    return destroy.mock.calls.length > 0
  }

  it('descarta até o teto sem fechar; passou do teto, fecha', async () => {
    expect(await feed(10, [4, 6])).toBe(false)
    expect(await feed(10, [4, 6, 1])).toBe(true)
  })

  it('upload com 25 MB + 1 declarado cabe no teto usado pelo /uploads (2× o limite)', async () => {
    const max = 25 * 1024 * 1024
    expect(await feed(max * 2, [max, 1])).toBe(false)
    expect(await feed(max, [max, 1])).toBe(true) // o teto antigo: a conexão caía no último byte
  })
})
