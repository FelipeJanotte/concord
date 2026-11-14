import type { IncomingMessage } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clientIp } from './http'

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
