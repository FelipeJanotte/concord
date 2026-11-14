// Utilidades HTTP usadas pelos módulos.
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * IP de quem fez a requisição. Atrás de um proxy (nginx, Caddy), defina
 * TRUST_PROXY=1 para usar o X-Forwarded-For; sem isso o cabeçalho é ignorado
 * (qualquer um poderia forjá-lo para fugir do limite).
 */
export function clientIp(req: IncomingMessage): string {
  if (process.env.TRUST_PROXY === '1') {
    const forwarded = req.headers['x-forwarded-for']
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
    if (first) return first
  }
  return req.socket.remoteAddress ?? 'desconhecido'
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

/**
 * Depois de responder um erro (ex.: 413) no meio de um envio: descarta o resto do
 * corpo para o app conseguir ler a resposta. Fechar a conexão na hora faz o cliente,
 * ainda enviando, perder a resposta ("fetch failed"). Se o cliente mandar mais que
 * `maxDiscard` bytes além disso, aí sim fecha.
 */
export function discardBody(req: IncomingMessage, maxDiscard: number): void {
  let discarded = 0
  req.unpipe()
  req.removeAllListeners('data')
  req.on('data', (chunk: Buffer) => {
    discarded += chunk.length
    if (discarded > maxDiscard) req.destroy()
  })
  req.resume()
}

/** Lê um corpo JSON pequeno (até `maxBytes`). */
export function readJson(req: IncomingMessage, maxBytes = 16_384): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('corpo grande demais'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        resolve(data && typeof data === 'object' ? data : {})
      } catch {
        reject(new Error('JSON inválido'))
      }
    })
    req.on('error', reject)
  })
}
