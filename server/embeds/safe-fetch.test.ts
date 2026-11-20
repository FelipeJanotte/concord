import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isPublicAddress } from './address'
import { FetchRefused } from './ports'
import { createSafeFetcher } from './safe-fetch'

let server: Server
let base = ''

const html = { maxBytes: 64, accepts: (type: string) => type === 'text/html', oversize: 'truncate' as const }

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/page') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<title>Oi</title>')
    if (req.url === '/big') return res.writeHead(200, { 'content-type': 'text/html' }).end('x'.repeat(10_000))
    if (req.url === '/json') return res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
    if (req.url === '/hop') return res.writeHead(302, { location: '/page' }).end()
    if (req.url?.startsWith('/loop')) return res.writeHead(301, { location: `/loop${Number(req.url.slice(5) || 0) + 1}` }).end()
    if (req.url === '/to-ftp') return res.writeHead(302, { location: 'ftp://exemplo.com/' }).end()
    if (req.url === '/missing') return res.writeHead(404).end()
    if (req.url === '/slow') return
    res.writeHead(500).end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

const open = createSafeFetcher({ allowAddress: () => true, timeoutMs: 300 })

describe('createSafeFetcher', () => {
  it('com a proteção de produção, recusa loopback por IP e por nome', async () => {
    const guarded = createSafeFetcher({ allowAddress: isPublicAddress })
    await expect(guarded.get(`${base}/page`, html)).rejects.toBeInstanceOf(FetchRefused)
    const port = new URL(base).port
    await expect(guarded.get(`http://localhost:${port}/page`, html)).rejects.toBeInstanceOf(FetchRefused)
  })

  it('valida o destino de cada redirecionamento', async () => {
    const onlyFirst = createSafeFetcher({ allowAddress: (() => {
      let calls = 0
      return () => ++calls === 1
    })() })
    await expect(onlyFirst.get(`${base}/hop`, html)).rejects.toBeInstanceOf(FetchRefused)
  })

  it('só http e https', async () => {
    await expect(open.get('file:///etc/passwd', html)).rejects.toBeInstanceOf(FetchRefused)
    await expect(open.get(`${base}/to-ftp`, html)).rejects.toBeInstanceOf(FetchRefused)
  })

  it('busca a página e devolve o endereço final depois do redirecionamento', async () => {
    const res = await open.get(`${base}/hop`, html)
    expect(res).toEqual({ url: `${base}/page`, contentType: 'text/html', body: Buffer.from('<title>Oi</title>') })
  })

  it('no máximo 3 redirecionamentos', async () => {
    await expect(open.get(`${base}/loop`, html)).rejects.toBeInstanceOf(FetchRefused)
  })

  it('corta o corpo no limite ou recusa, conforme o pedido', async () => {
    expect((await open.get(`${base}/big`, html)).body.length).toBe(64)
    await expect(open.get(`${base}/big`, { ...html, oversize: 'reject' })).rejects.toBeInstanceOf(FetchRefused)
  })

  it('recusa tipo não aceito e status de erro', async () => {
    await expect(open.get(`${base}/json`, html)).rejects.toBeInstanceOf(FetchRefused)
    await expect(open.get(`${base}/missing`, html)).rejects.toBeInstanceOf(FetchRefused)
  })

  it('desiste no tempo máximo', async () => {
    const started = Date.now()
    await expect(open.get(`${base}/slow`, html)).rejects.toBeInstanceOf(FetchRefused)
    expect(Date.now() - started).toBeLessThan(2000)
  })
})
