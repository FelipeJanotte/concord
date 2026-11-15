/**
 * Anexos: envio (`POST /uploads`), download (`GET /files/<id>/<nome>`) e limpeza.
 *
 * Segurança:
 * - só quem tem sessão envia (`Authorization: Bearer <token>`); limite de 25 MB contado
 *   nos bytes que chegam, não no Content-Length;
 * - o tipo de imagem vem dos bytes (sniff). Só PNG/JPEG/GIF/WebP confirmados são
 *   servidos "inline"; todo o resto vai como `application/octet-stream` + download,
 *   então um .html ou .svg enviado nunca roda no app;
 * - só arquivos que já estão numa mensagem podem ser baixados, e só por link assinado
 *   para uma conta que ainda pode ver o canal da mensagem (`server/files-signing.ts`, v2).
 */
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Transform, type TransformCallback } from 'node:stream'
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_NAME_MAX,
  isInlineImage,
  type UploadResult
} from '../../src/shared/types'
import { accountFromToken } from '../auth'
import { UPLOAD_ORPHAN_TTL_MS, UPLOAD_SWEEP_INTERVAL_MS } from '../config'
import type { ServerModule } from '../context'
import { allowed } from '../access'
import { FILE_URL_TTL_MS, verifyFileQuery } from '../files-signing'
import { discardBody, sendJson } from '../http'
import { limiters, retryText } from '../middleware/rate-limit'
import {
  deleteStaleUnattached,
  existingAttachmentIds,
  findPublishedAttachment,
  insertAttachment
} from '../repo/attachments'
import { storage } from '../storage'
import { sniffImage } from '../storage/sniff'

/** Quantos bytes do começo guardamos para descobrir o tipo e as dimensões da imagem. */
const HEAD_BYTES = 256 * 1024

class TooLarge extends Error {}

/** Conta os bytes (erro acima do limite) e guarda o começo do arquivo. */
class LimitAndPeek extends Transform {
  size = 0
  private chunks: Buffer[] = []
  private kept = 0

  constructor(private readonly max: number) {
    super()
  }

  get head(): Buffer {
    return Buffer.concat(this.chunks)
  }

  _transform(chunk: Buffer, _enc: BufferEncoding, done: TransformCallback): void {
    this.size += chunk.length
    if (this.size > this.max) return done(new TooLarge())
    if (this.kept < HEAD_BYTES) {
      const part = chunk.subarray(0, HEAD_BYTES - this.kept)
      this.chunks.push(part)
      this.kept += part.length
    }
    done(null, chunk)
  }
}

/** Nome seguro para guardar e mostrar: sem pastas, sem caracteres de controle, até 200 caracteres. */
export function cleanFileName(raw: string | undefined): string {
  let name = ''
  try {
    name = decodeURIComponent(raw ?? '')
  } catch {
    name = raw ?? ''
  }
  name = name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .split(/[\\/]/)
    .pop()!
    .trim()
  if (!name || name === '.' || name === '..') name = 'arquivo'
  if (name.length > ATTACHMENT_NAME_MAX) {
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : ''
    name = name.slice(0, ATTACHMENT_NAME_MAX - ext.length) + ext
  }
  return name
}

/** Content-Type informado pelo app, só para exibir (nunca decide como o arquivo é servido). */
function declaredType(raw: string | undefined): string {
  const type = (raw ?? '').split(';')[0].trim().toLowerCase()
  return /^[a-z0-9][\w.+-]*\/[\w.+-]+$/.test(type) && !type.startsWith('image/') ? type : 'application/octet-stream'
}

function bearer(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined
}

function reply(res: ServerResponse, status: number, body: UploadResult): void {
  sendJson(res, status, body)
}

async function handleUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const account = await accountFromToken(bearer(req))
  if (!account) {
    req.resume()
    return reply(res, 401, { ok: false, error: 'Sessão inválida. Entre de novo.' })
  }

  const limited = limiters.upload.take(account.id)
  if (!limited.ok) {
    req.resume()
    res.setHeader('retry-after', String(Math.ceil(limited.retryAfterMs / 1000)))
    return reply(res, 429, { ok: false, error: `Muitos envios seguidos. ${retryText(limited.retryAfterMs)}` })
  }

  const declaredLength = Number(req.headers['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > ATTACHMENT_MAX_BYTES) {
    reply(res, 413, { ok: false, error: 'Arquivo maior que 25 MB' })
    // o app precisa conseguir ler o 413: descarta o corpo inteiro (até 2× o limite; 25 MB + 1 byte não
    // pode bater no teto do descarte, senão a conexão cai no último byte e o app perde a resposta)
    discardBody(req, ATTACHMENT_MAX_BYTES * 2)
    return
  }

  const id = randomUUID()
  const counter = new LimitAndPeek(ATTACHMENT_MAX_BYTES)
  // `pipe` não repassa erros: se o app cair no meio do envio, encerra a gravação (nada fica salvo).
  req.on('error', (err) => counter.destroy(err))
  req.on('close', () => {
    if (!req.complete) counter.destroy(new Error('envio interrompido'))
  })
  try {
    await storage.save(id, req.pipe(counter))
  } catch (err) {
    if (err instanceof TooLarge) {
      reply(res, 413, { ok: false, error: 'Arquivo maior que 25 MB' })
      discardBody(req, ATTACHMENT_MAX_BYTES)
      return
    }
    if (!req.complete) return // o app desistiu: não há a quem responder
    throw err
  }

  if (counter.size === 0) {
    await storage.remove(id)
    return reply(res, 400, { ok: false, error: 'O arquivo está vazio' })
  }

  const image = sniffImage(counter.head)
  try {
    const attachment = await insertAttachment({
      id,
      uploaderId: account.id,
      name: cleanFileName(req.headers['x-file-name'] as string | undefined),
      contentType: image?.contentType ?? declaredType(req.headers['content-type']),
      size: counter.size,
      width: image?.width ?? null,
      height: image?.height ?? null
    })
    reply(res, 200, { ok: true, attachment })
  } catch (err) {
    await storage.remove(id)
    throw err
  }
}

async function handleDownload(res: ServerResponse, id: string, query: URLSearchParams): Promise<void> {
  // Link assinado para uma conta (v2): confere assinatura, validade e se ela ainda vê o canal.
  // Qualquer falha responde 404, igual a anexo inexistente (não revela que o arquivo existe).
  const accountId = verifyFileQuery(id, query)
  const found = accountId ? await findPublishedAttachment(id) : undefined
  const canSee = !!found && !!accountId && (await allowed(accountId, 'view', found.channelId))
  const file = canSee ? await storage.open(found.attachment.id) : null
  if (!found || !file) {
    res.writeHead(404).end()
    return
  }
  const { attachment } = found
  const inline = isInlineImage(attachment.contentType)
  res.writeHead(200, {
    'content-type': inline ? attachment.contentType : 'application/octet-stream',
    'content-length': String(file.size),
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    // o conteúdo nunca muda, mas o link assinado expira: o cache vale até a validade dele
    'cache-control': `private, max-age=${Math.floor(FILE_URL_TTL_MS / 1000)}`
  })
  file.stream.pipe(res)
  file.stream.on('error', () => res.destroy())
}

/** Apaga anexos soltos (enviados e nunca usados) e os arquivos deles. */
export async function sweepUnattached(now = Date.now()): Promise<number> {
  const ids = await deleteStaleUnattached(new Date(now - UPLOAD_ORPHAN_TTL_MS))
  for (const id of ids) await storage.remove(id)
  return ids.length
}

/** Apaga do storage arquivos que não têm registro no banco (ex.: queda no meio de um envio). */
export async function sweepOrphanFiles(): Promise<number> {
  const files = await storage.list()
  const known = await existingAttachmentIds(files)
  const orphans = files.filter((id) => !known.has(id))
  for (const id of orphans) await storage.remove(id)
  return orphans.length
}

export const uploadsModule: ServerModule = {
  async http(req, res, path) {
    if (req.method === 'POST' && path === '/uploads') {
      await handleUpload(req, res)
      return true
    }
    const match = /^\/files\/([^/]+)(?:\/.*)?$/.exec(path)
    if (req.method === 'GET' && match) {
      await handleDownload(res, match[1], new URL(req.url ?? '/', 'http://x').searchParams)
      return true
    }
    return false
  },

  async init() {
    const orphans = await sweepOrphanFiles()
    if (orphans) console.log(`[uploads] ${orphans} arquivo(s) sem registro apagado(s)`)
    const sweep = (): void => {
      sweepUnattached().then(
        (n) => n && console.log(`[uploads] ${n} anexo(s) não usado(s) apagado(s)`),
        (err) => console.error('[uploads] limpeza falhou:', err)
      )
    }
    sweep()
    setInterval(sweep, UPLOAD_SWEEP_INTERVAL_MS).unref()
  }
}
