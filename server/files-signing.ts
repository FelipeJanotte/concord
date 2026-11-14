/**
 * Links de download de anexos assinados por pessoa (v2).
 *
 * Cada conta recebe a URL do anexo com `a` (conta), `e` (validade, ms) e `s`
 * (HMAC-SHA256 de id|conta|validade). No download o servidor confere a assinatura,
 * a validade e se ESSA conta ainda pode ver o canal da mensagem — então perder o
 * acesso ao canal invalida o link na hora, e um link vazado expira.
 *
 * O segredo vem de FILES_SIGNING_SECRET; sem ela, é sorteado no boot (os links
 * antigos param ao reiniciar, e o app recebe links novos ao reconectar).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Attachment, Message } from '../src/shared/types'

const SECRET = process.env.FILES_SIGNING_SECRET?.trim() || randomBytes(32).toString('hex')

/** Por quanto tempo um link vale (padrão 24 h; o app recebe links novos a cada histórico/reconexão). */
export const FILE_URL_TTL_MS = Number(process.env.FILE_URL_TTL_MS) || 24 * 60 * 60 * 1000

function signature(attachmentId: string, accountId: string, expiresAt: number): string {
  return createHmac('sha256', SECRET).update(`${attachmentId}|${accountId}|${expiresAt}`).digest('base64url')
}

/**
 * Assina um caminho do servidor para a conta (`?a=&e=&s=`), amarrado ao `id` do recurso.
 * Usado pelos anexos e pelos efeitos sonoros (A10).
 */
export function signResourceUrl(path: string, id: string, accountId: string, now = Date.now()): string {
  const base = path.split('?')[0]
  const e = now + FILE_URL_TTL_MS
  const query = new URLSearchParams({ a: accountId, e: String(e), s: signature(id, accountId, e) })
  return `${base}?${query}`
}

/** URL assinada do anexo para a conta (o caminho `/files/<id>/<nome>` continua igual). */
export function signFileUrl(attachment: Attachment, accountId: string, now = Date.now()): string {
  return signResourceUrl(attachment.url, attachment.id, accountId, now)
}

/** A mensagem com os links dos anexos assinados para a conta. */
export function signMessage(message: Message, accountId: string, now = Date.now()): Message {
  if (message.attachments.length === 0) return message
  return { ...message, attachments: message.attachments.map((a) => ({ ...a, url: signFileUrl(a, accountId, now) })) }
}

/**
 * Confere a query de um download. Devolve a conta que recebeu o link, ou null se
 * faltar algo, a assinatura não bater ou o link tiver expirado.
 */
export function verifyFileQuery(attachmentId: string, query: URLSearchParams, now = Date.now()): string | null {
  const accountId = query.get('a')
  const e = Number(query.get('e'))
  const s = query.get('s')
  if (!accountId || !s || !Number.isFinite(e) || e < now) return null
  const expected = Buffer.from(signature(attachmentId, accountId, e))
  const got = Buffer.from(s)
  return got.length === expected.length && timingSafeEqual(got, expected) ? accountId : null
}
