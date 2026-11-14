/**
 * LiveKit falso para testes de voz: finge ser a API Twirp do LiveKit (RoomService),
 * guarda as chamadas e responde como o de verdade. O servidor de teste aponta para ele
 * com `liveKitEnv(apiUrl)`. (Veio do voice.test.ts da B1; compartilhado com permissions.test.ts.)
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { sleep } from './helpers'

export const LIVEKIT_API_KEY = 'chave-de-teste'
export const LIVEKIT_API_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres'
export const LIVEKIT_URL = 'ws://livekit.exemplo.test:7880'

export interface ApiCall {
  method: string
  body: Record<string, unknown>
  auth: string
}

export class FakeLiveKit {
  calls: ApiCall[] = []
  /** quando true, RemoveParticipant responde 404 (pessoa que não está na sala) */
  notFound = false
  private server: Server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c: Buffer) => (raw += c.toString()))
    req.on('end', () => {
      const method = req.url?.split('/').pop() ?? ''
      this.calls.push({ method, body: raw ? JSON.parse(raw) : {}, auth: req.headers.authorization ?? '' })
      // Como o LiveKit de verdade: tirar alguém que não está na sala dá 404.
      if (method === 'RemoveParticipant' && this.notFound) {
        res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ code: 'not_found', msg: 'participant not found' }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    })
  })

  async start(): Promise<string> {
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r))
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  stop(): Promise<void> {
    return new Promise((r) => this.server.close(() => r()))
  }

  /** Espera uma chamada que satisfaça `match` (as chamadas da API são assíncronas). */
  async waitCall(method: string, match: (body: Record<string, unknown>) => boolean = () => true): Promise<ApiCall> {
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      const call = this.calls.find((c) => c.method === method && match(c.body))
      if (call) return call
      await sleep(25)
    }
    throw new Error(`o LiveKit falso não recebeu ${method}`)
  }
}

/** Variáveis para o servidor de teste usar o LiveKit falso (`TestServer.start({ env })`). */
export function liveKitEnv(apiUrl: string): Record<string, string> {
  return { LIVEKIT_URL, LIVEKIT_API_URL: apiUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET }
}

/** Roda `fn` com variáveis de ambiente trocadas (o servidor de teste herda process.env). */
export function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]))
  Object.assign(process.env, vars)
  return fn().finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })
}
