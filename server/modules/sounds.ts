/**
 * Efeitos sonoros da comunidade (A10, contrato em src/shared/types/sounds.ts).
 *
 * - `POST /sounds`: corpo = bytes do áudio (até 512 KB), `Authorization: Bearer`,
 *   `X-Sound-Name`, `X-Sound-Emoji`. Tipo pelos bytes (MP3/OGG/WAV/WebM) e duração
 *   lida do arquivo (até 5 s). Limites: sons por conta e no total.
 * - `GET /sounds/<id>`: link assinado por conta (o mesmo esquema dos anexos).
 * - `sound:play`: exige estar na sala e poder falar nela (`speak`, sem silêncio de moderador, B6); 1 a cada 3 s por conta
 *   e nunca por cima do som anterior da mesma conta; `sound:played` só para a sala.
 * - `sound:delete`: o autor ou quem tem `manageMessages`.
 * Os bytes ficam em DATA_DIR/sounds (fora da pasta dos anexos, que tem limpeza própria).
 */
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import {
  cleanSoundEmoji,
  SOUND_MAX_BYTES,
  SOUND_MAX_DURATION_MS,
  SOUND_NAME_MAX,
  type Sound,
  type SoundUploadResult
} from '../../src/shared/types'
import { allowed } from '../access'
import { accountFromToken } from '../auth'
import { SOUND_DIR, SOUNDS_PER_ACCOUNT, SOUNDS_TOTAL } from '../config'
import { guard, type AppServer, type ServerModule } from '../context'
import { FILE_URL_TTL_MS, signResourceUrl, verifyFileQuery } from '../files-signing'
import { discardBody, sendJson } from '../http'
import { limiters, retryText } from '../middleware/rate-limit'
import { countSounds, deleteSound, findSound, insertSound, listSounds } from '../repo/sounds'
import { DuplicateError } from '../repo/util'
import { diskStorage } from '../storage'
import { audioDurationMs, sniffAudio } from '../storage/audio'
import { isServerMuted, voiceChannelOf, voiceSocketsIn } from './voice'

export const soundStorage = diskStorage(SOUND_DIR)

/** conta → até quando o som que ela tocou ainda está tocando (ms) */
const playingUntil = new Map<string, number>()

const signSound = (sound: Sound, accountId: string): Sound => ({
  ...sound,
  url: signResourceUrl(sound.url, sound.id, accountId)
})

function decodeHeader(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  try {
    return decodeURIComponent(value ?? '')
  } catch {
    return value ?? ''
  }
}

function cleanName(raw: string): string | null {
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ')
  return name.length >= 1 && name.length <= SOUND_NAME_MAX ? name : null
}


class TooLarge extends Error {}

/** Lê o corpo inteiro (no máximo `max` bytes). */
function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > max) {
        reject(new TooLarge())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function reply(res: ServerResponse, status: number, body: SoundUploadResult): void {
  sendJson(res, status, body)
}

async function handleUpload(io: AppServer, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const header = req.headers.authorization
  const account = await accountFromToken(header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined)
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
  if (Number(req.headers['content-length']) > SOUND_MAX_BYTES) {
    reply(res, 413, { ok: false, error: 'O som pode ter no máximo 512 KB' })
    discardBody(req, SOUND_MAX_BYTES * 4) // o app precisa conseguir ler o 413
    return
  }

  let data: Buffer
  try {
    data = await readBody(req, SOUND_MAX_BYTES)
  } catch (err) {
    if (err instanceof TooLarge) {
      reply(res, 413, { ok: false, error: 'O som pode ter no máximo 512 KB' })
      discardBody(req, SOUND_MAX_BYTES * 4)
      return
    }
    throw err
  }

  const name = cleanName(decodeHeader(req.headers['x-sound-name']))
  if (!name) return reply(res, 400, { ok: false, error: `Dê um nome ao som (até ${SOUND_NAME_MAX} caracteres)` })
  const emoji = cleanSoundEmoji(decodeHeader(req.headers['x-sound-emoji']))
  if (emoji === undefined) return reply(res, 400, { ok: false, error: 'Emoji inválido' })
  if (data.length === 0) return reply(res, 400, { ok: false, error: 'O arquivo está vazio' })

  const type = sniffAudio(data)
  if (!type) return reply(res, 400, { ok: false, error: 'Envie um áudio MP3, OGG, WAV ou WebM' })
  const durationMs = await audioDurationMs(data, type)
  if (durationMs === null) return reply(res, 400, { ok: false, error: 'Não foi possível ler a duração do áudio' })
  if (durationMs > SOUND_MAX_DURATION_MS) return reply(res, 400, { ok: false, error: 'O som pode ter no máximo 5 segundos' })

  if ((await countSounds(account.id)) >= SOUNDS_PER_ACCOUNT) {
    return reply(res, 400, { ok: false, error: `Você já tem ${SOUNDS_PER_ACCOUNT} sons. Apague algum para enviar outro.` })
  }
  if ((await countSounds()) >= SOUNDS_TOTAL) return reply(res, 400, { ok: false, error: 'A coleção de sons está cheia' })

  const id = randomUUID()
  await soundStorage.save(id, Readable.from([data]))
  let stored
  try {
    stored = await insertSound({ id, name, emoji, uploaderId: account.id, contentType: type, size: data.length, durationMs })
  } catch (err) {
    await soundStorage.remove(id)
    if (err instanceof DuplicateError) return reply(res, 400, { ok: false, error: 'Já existe um som com esse nome' })
    throw err
  }

  // todos ficam sabendo (cada um com o link assinado para si)
  for (const socket of io.sockets.sockets.values()) {
    const user = socket.data.user
    if (user) socket.emit('sound:created', signSound(stored.sound, user.accountId))
  }
  reply(res, 200, { ok: true, sound: signSound(stored.sound, account.id) })
}

async function handleDownload(res: ServerResponse, id: string, query: URLSearchParams): Promise<void> {
  const accountId = verifyFileQuery(id, query)
  const stored = accountId ? await findSound(id) : undefined
  const file = stored ? await soundStorage.open(stored.sound.id) : null
  if (!stored || !file) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, {
    'content-type': stored.contentType,
    'content-length': String(file.size),
    'content-disposition': 'inline',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'cache-control': `private, max-age=${Math.floor(FILE_URL_TTL_MS / 1000)}`
  })
  file.stream.pipe(res)
  file.stream.on('error', () => res.destroy())
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** Criado por módulo: precisa do `io` para avisar todos no upload. */
let ioRef: AppServer | null = null

export const soundsModule: ServerModule = {
  init(io) {
    ioRef = io
  },

  async http(req, res, path) {
    if (req.method === 'POST' && path === '/sounds') {
      if (!ioRef) throw new Error('soundsModule.init não rodou')
      await handleUpload(ioRef, req, res)
      return true
    }
    const match = /^\/sounds\/([^/]+)$/.exec(path)
    if (req.method === 'GET' && match) {
      await handleDownload(res, match[1], new URL(req.url ?? '/', 'http://x').searchParams)
      return true
    }
    return false
  },

  socket(io, socket) {
    socket.on('sound:list', (ack) => {
      if (typeof ack !== 'function') return
      void guard('sound:list', async () => {
        const user = socket.data.user
        if (!user) return ack([])
        ack((await listSounds()).map((s) => signSound(s.sound, user.accountId)))
      })
    })

    socket.on('sound:play', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('sound:play', async () => {
        const user = socket.data.user
        if (!user) return ack(fail('Não autenticado'))
        const channelId = payload?.channelId
        if (typeof channelId !== 'string' || voiceChannelOf(socket.id) !== channelId) {
          return ack(fail('Entre na sala de voz para tocar sons'))
        }
        if (!(await allowed(user.accountId, 'speak', channelId))) {
          return ack(fail('Você não tem permissão para falar nesta sala'))
        }
        // silenciado por um moderador (B6) não fala nem toca sons, em nenhuma sala
        if (isServerMuted(user.accountId)) return ack(fail('Um moderador silenciou você nas salas de voz'))
        const stored = typeof payload.soundId === 'string' ? await findSound(payload.soundId) : undefined
        if (!stored) return ack(fail('Som não encontrado'))
        const now = Date.now()
        if ((playingUntil.get(user.accountId) ?? 0) > now) return ack(fail('Espere o som anterior terminar'))
        const limited = limiters.sound.take(user.accountId)
        if (!limited.ok) return ack(fail(`Calma! ${retryText(limited.retryAfterMs)}`))
        playingUntil.set(user.accountId, now + stored.sound.durationMs)

        const event = { channelId, soundId: stored.sound.id, by: socket.id, accountId: user.accountId }
        for (const sid of voiceSocketsIn(channelId)) io.to(sid).emit('sound:played', event)
        ack({ ok: true })
      })
    })

    socket.on('sound:delete', (soundId, ack) => {
      if (typeof ack !== 'function') return
      void guard('sound:delete', async () => {
        const user = socket.data.user
        if (!user) return ack(fail('Não autenticado'))
        const stored = typeof soundId === 'string' ? await findSound(soundId) : undefined
        if (!stored) return ack(fail('Som não encontrado'))
        const mine = stored.sound.uploaderId === user.accountId
        if (!mine && !(await allowed(user.accountId, 'manageMessages'))) {
          return ack(fail('Só quem enviou (ou quem gerencia mensagens) pode apagar este som'))
        }
        await deleteSound(stored.sound.id)
        await soundStorage.remove(stored.sound.id)
        io.emit('sound:deleted', stored.sound.id)
        ack({ ok: true })
      })
    })
  }
}
