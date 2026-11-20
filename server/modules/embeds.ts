import type { ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { MessageEmbedUpdate, OkResult } from '../../src/shared/types'
import { allowed, emitToViewers } from '../access'
import { EMBED_DIR, UPLOAD_SWEEP_INTERVAL_MS } from '../config'
import { guard, type AppServer, type ServerModule } from '../context'
import { webFetcher } from '../embeds/drivers'
import { firstPreviewLink } from '../embeds/first-link'
import { LinkPreviewer, type LinkPreview } from '../embeds/previewer'
import { FILE_URL_TTL_MS, signEmbed, verifyFileQuery } from '../files-signing'
import { limiters } from '../middleware/rate-limit'
import { findEmbedState, messagesWithEmbedImage, setEmbed, toLinkEmbed, type StoredEmbed } from '../repo/messages'
import { diskStorage } from '../storage'

export const embedStorage = diskStorage(EMBED_DIR)

let previewer: LinkPreviewer | null = null
const linkPreviewer = (): LinkPreviewer => (previewer ??= new LinkPreviewer(webFetcher()))

const NOT_FOUND: OkResult = { ok: false, error: 'Mensagem não encontrada' }

async function publish(io: AppServer, messageId: string, channelId: string, stored: StoredEmbed | null): Promise<void> {
  const update: MessageEmbedUpdate = { channelId, messageId, embed: stored && toLinkEmbed(messageId, stored) }
  await emitToViewers(io, channelId, 'message:embed', update, {
    forAccount: (payload, accountId) => (payload.embed ? { ...payload, embed: signEmbed(payload.embed, messageId, accountId) } : payload)
  })
}

async function store(messageId: string, preview: LinkPreview | null): Promise<StoredEmbed | null> {
  await embedStorage.remove(messageId)
  if (!preview) return null
  if (!preview.image) return preview.embed
  await embedStorage.save(messageId, Readable.from([preview.image.bytes]))
  return { ...preview.embed, imageType: preview.image.contentType }
}

async function refresh(io: AppServer, messageId: string, accountId: string, url: string | null): Promise<void> {
  const preview = url && limiters.embed.take(accountId).ok ? await linkPreviewer().preview(url) : null
  const current = await findEmbedState(messageId)
  if (!current || firstPreviewLink(current.content) !== url) return
  if (!preview && !current.embed) return
  const stored = await store(messageId, preview)
  if (!(await setEmbed(messageId, stored))) return embedStorage.remove(messageId)
  await publish(io, messageId, current.channelId, stored)
}

export function previewNewMessage(io: AppServer, messageId: string, accountId: string, content: string): void {
  const url = firstPreviewLink(content)
  if (url) void guard('message:embed', () => refresh(io, messageId, accountId, url))
}

export function previewEditedMessage(io: AppServer, messageId: string, accountId: string, before: string, after: string): void {
  const url = firstPreviewLink(after)
  if (url !== firstPreviewLink(before)) void guard('message:embed', () => refresh(io, messageId, accountId, url))
}

async function serveImage(res: ServerResponse, messageId: string, query: URLSearchParams): Promise<void> {
  const accountId = verifyFileQuery(messageId, query)
  const state = accountId ? await findEmbedState(messageId) : undefined
  const imageType = state?.embed?.imageType
  const canSee = !!state && !!imageType && !!accountId && (await allowed(accountId, 'view', state.channelId))
  const file = canSee ? await embedStorage.open(messageId) : null
  if (!file || !imageType) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, {
    'content-type': imageType,
    'content-length': String(file.size),
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cache-control': `private, max-age=${Math.floor(FILE_URL_TTL_MS / 1000)}`
  })
  file.stream.pipe(res)
  file.stream.on('error', () => res.destroy())
}

export async function sweepEmbedImages(): Promise<number> {
  const files = await embedStorage.list()
  const kept = await messagesWithEmbedImage(files)
  const orphans = files.filter((id) => !kept.has(id))
  for (const id of orphans) await embedStorage.remove(id)
  return orphans.length
}

export const embedsModule: ServerModule = {
  async http(req, res, path) {
    const match = /^\/embeds\/([^/]+)$/.exec(path)
    if (req.method !== 'GET' || !match) return false
    await serveImage(res, match[1], new URL(req.url ?? '/', 'http://x').searchParams)
    return true
  },

  async init() {
    const sweep = (): void => {
      sweepEmbedImages().then(
        (n) => n && console.log(`[embeds] ${n} imagem(ns) de prévia sem mensagem apagada(s)`),
        (err) => console.error('[embeds] limpeza falhou:', err)
      )
    }
    sweep()
    setInterval(sweep, UPLOAD_SWEEP_INTERVAL_MS).unref()
  },

  socket(io, socket) {
    socket.on('message:embed-remove', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('message:embed-remove', async () => {
        const user = socket.data.user
        if (!user) return ack({ ok: false, error: 'Não autenticado' })
        const messageId = payload?.messageId
        const state = typeof messageId === 'string' ? await findEmbedState(messageId) : undefined
        if (!state || !(await allowed(user.accountId, 'view', state.channelId))) return ack(NOT_FOUND)
        if (state.authorId !== user.accountId) return ack({ ok: false, error: 'Você só pode remover a prévia das suas mensagens' })
        if (state.embed) {
          await setEmbed(messageId, null)
          await embedStorage.remove(messageId)
          await publish(io, messageId, state.channelId, null)
        }
        ack({ ok: true })
      })
    })
  }
}
