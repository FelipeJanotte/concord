import { lookup as dnsLookup } from 'node:dns'
import http, { type IncomingMessage } from 'node:http'
import https from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import { FetchRefused, type WebFetcher, type WebRequest, type WebResponse } from './ports'

export const FETCH_TIMEOUT_MS = 3000
export const MAX_REDIRECTS = 3
const USER_AGENT = 'Mozilla/5.0 (compatible; ConcordLinkPreview/1.0)'

type AddressPolicy = (ip: string) => boolean

function guardedLookup(allowAddress: AddressPolicy): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { all: true, family: options.family }, (err, addresses) => {
      if (err) return callback(err, '', 0)
      const allowed = addresses.filter((a) => allowAddress(a.address))
      if (allowed.length === 0) return callback(new FetchRefused(`endereço recusado: ${hostname}`), '', 0)
      if (options.all) return callback(null, allowed)
      callback(null, allowed[0].address, allowed[0].family)
    })
  }
}

function checkedUrl(raw: string, allowAddress: AddressPolicy): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new FetchRefused('endereço inválido')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchRefused(`protocolo recusado: ${url.protocol}`)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && !allowAddress(host)) throw new FetchRefused(`endereço recusado: ${host}`)
  return url
}

function requestOnce(url: URL, signal: AbortSignal, lookup: LookupFunction): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const req = client.request(url, { method: 'GET', lookup, signal, agent: false, headers: { 'user-agent': USER_AGENT, accept: 'text/html, image/*;q=0.8' } }, resolve)
    req.on('error', reject)
    req.end()
  })
}

async function readBody(res: IncomingMessage, { maxBytes, oversize }: WebRequest): Promise<Buffer> {
  const declared = Number(res.headers['content-length'])
  if (oversize === 'reject' && declared > maxBytes) throw new FetchRefused('arquivo grande demais')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of res as AsyncIterable<Buffer>) {
    const room = maxBytes - size
    if (chunk.length > room) {
      if (oversize === 'reject') throw new FetchRefused('arquivo grande demais')
      chunks.push(chunk.subarray(0, room))
      break
    }
    chunks.push(chunk)
    size += chunk.length
  }
  res.destroy()
  return Buffer.concat(chunks)
}

const isRedirect = (status: number): boolean => [301, 302, 303, 307, 308].includes(status)

async function follow(raw: string, request: WebRequest, signal: AbortSignal, allowAddress: AddressPolicy): Promise<WebResponse> {
  const lookup = guardedLookup(allowAddress)
  let current = raw
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = checkedUrl(current, allowAddress)
    const res = await requestOnce(url, signal, lookup)
    const status = res.statusCode ?? 0
    const location = res.headers.location
    if (isRedirect(status) && location) {
      res.destroy()
      current = new URL(location, url).href
      continue
    }
    if (status < 200 || status >= 300) {
      res.destroy()
      throw new FetchRefused(`status ${status}`)
    }
    const contentType = (res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    if (!request.accepts(contentType)) {
      res.destroy()
      throw new FetchRefused(`tipo recusado: ${contentType}`)
    }
    return { url: url.href, contentType, body: await readBody(res, request) }
  }
  throw new FetchRefused('redirecionamentos demais')
}

export function createSafeFetcher({ allowAddress, timeoutMs = FETCH_TIMEOUT_MS }: { allowAddress: AddressPolicy; timeoutMs?: number }): WebFetcher {
  return {
    async get(raw, request) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        return await follow(raw, request, controller.signal, allowAddress)
      } catch (err) {
        throw err instanceof FetchRefused ? err : new FetchRefused(err instanceof Error ? err.message : 'falha na busca')
      } finally {
        clearTimeout(timer)
      }
    }
  }
}
