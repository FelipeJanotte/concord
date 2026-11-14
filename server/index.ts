/**
 * Servidor do Concord: contas (HTTP), canais e mensagens, lista de usuários
 * online e sinalização WebRTC dos canais de voz (o áudio em si vai direto de
 * um usuário para o outro, peer-to-peer).
 *
 *   npm run server          (com recarregamento automático)
 *   PORT=4000 npm run server
 *
 * Rotas HTTP: GET /auth/config, POST /auth/register, /auth/login, /auth/google,
 * /auth/logout e GET /avatars/<accountId>. O socket só conecta com
 * `auth: { token }` válido.
 */
import './env'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { Server, type Socket } from 'socket.io'
import type {
  AuthConfig,
  Channel,
  ChannelType,
  ClientToServerEvents,
  Message,
  ServerState,
  ServerToClientEvents,
  User,
  VoiceState
} from '../src/shared/types'
import {
  accountFromToken,
  avatarUrl,
  findAccount,
  GOOGLE_CLIENT_ID,
  googleLogin,
  login,
  register,
  revokeSession,
  toAccountInfo,
  updateProfile
} from './auth'
import { AVATAR_DIR, db, save, type Account } from './db'

const PORT = Number(process.env.PORT ?? 3001)
const MAX_HISTORY = 500
const MAX_MESSAGE_LENGTH = 2000
const MAX_CHANNELS = 100

// ---------- Estado em memória ----------

const users = new Map<string, User>()
const voice = new Map<string, VoiceState>()

const snapshot = (): ServerState => ({
  channels: db.channels,
  users: [...users.values()],
  voice: [...voice.values()]
})

function userFor(socketId: string, a: Account): User {
  return { id: socketId, accountId: a.id, name: a.name, tag: a.tag, color: a.color, avatarUrl: avatarUrl(a) }
}

function normalizeChannelName(raw: unknown, type: ChannelType): string | null {
  if (typeof raw !== 'string') return null
  let name = raw.trim().replace(/\s+/g, ' ')
  if (type === 'text') name = name.toLowerCase().replace(/ /g, '-')
  name = name.slice(0, 32)
  return name || null
}

// ---------- HTTP (contas e fotos) ----------

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 16_384) {
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

async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // O app roda em file:// (build) ou localhost:5173 (dev), então liberamos CORS.
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'content-type')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }

  const path = new URL(req.url ?? '/', 'http://x').pathname

  if (req.method === 'GET' && path === '/auth/config') {
    return sendJson(res, 200, { googleClientId: GOOGLE_CLIENT_ID } satisfies AuthConfig)
  }

  if (req.method === 'GET' && path.startsWith('/avatars/')) {
    const account = findAccount(path.slice('/avatars/'.length))
    const file = account ? join(AVATAR_DIR, account.id) : ''
    if (!account?.avatarType || !existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, {
      'content-type': account.avatarType,
      'x-content-type-options': 'nosniff',
      'cache-control': 'public, max-age=31536000, immutable'
    })
    res.end(readFileSync(file))
    return
  }

  if (req.method === 'POST' && path.startsWith('/auth/')) {
    let body: Record<string, unknown>
    try {
      body = await readJson(req)
    } catch {
      return sendJson(res, 400, { ok: false, error: 'Requisição inválida' })
    }
    switch (path) {
      case '/auth/register':
        return sendJson(res, 200, await register(body))
      case '/auth/login':
        return sendJson(res, 200, await login(body))
      case '/auth/google':
        return sendJson(res, 200, await googleLogin(body))
      case '/auth/logout':
        revokeSession(body.token)
        return sendJson(res, 200, { ok: true })
    }
  }

  if (req.method === 'GET' && path === '/') {
    return sendJson(res, 200, { name: 'concord-server', online: users.size })
  }

  sendJson(res, 404, { error: 'não encontrado' })
}

const httpServer = createServer((req, res) => {
  handleHttp(req, res).catch((err) => {
    console.error('[http]', err)
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Erro interno do servidor' })
  })
})

// ---------- Socket.IO ----------

interface SocketData {
  accountId: string
}

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: { origin: '*' },
  // fotos de perfil chegam como data URL pelo account:update
  maxHttpBufferSize: 1_000_000
})

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

// Só aceita conexões com uma sessão válida.
io.use((socket, next) => {
  const account = accountFromToken((socket.handshake.auth as { token?: unknown } | undefined)?.token)
  if (!account) return next(new Error('unauthorized'))
  socket.data.accountId = account.id
  next()
})

const voiceRoom = (channelId: string): string => `voice:${channelId}`
const emitVoice = (): void => {
  io.emit('voice:state', [...voice.values()])
}

function leaveVoice(socket: AppSocket): void {
  const state = voice.get(socket.id)
  if (!state) return
  voice.delete(socket.id)
  socket.leave(voiceRoom(state.channelId))
  io.to(voiceRoom(state.channelId)).emit('voice:peer-left', socket.id)
  emitVoice()
}

io.on('connection', (socket: AppSocket) => {
  let user: User | null = null

  socket.on('hello', (ack) => {
    if (typeof ack !== 'function') return
    const account = findAccount(socket.data.accountId)
    if (!account) {
      socket.disconnect(true)
      return
    }
    const isNew = !user
    user = userFor(socket.id, account)
    users.set(socket.id, user)
    ack({ self: user, account: toAccountInfo(account), state: snapshot() })
    if (isNew) socket.broadcast.emit('user:joined', user)
    console.log(`[+] ${account.name}#${account.tag} conectou (${users.size} online)`)
  })

  socket.on('account:update', (payload, ack) => {
    if (typeof ack !== 'function') return
    const account = findAccount(socket.data.accountId)
    if (!user || !account) return ack({ ok: false, error: 'Não autenticado' })
    const res = updateProfile(account, payload ?? {})
    if (res.ok) {
      const { name, tag, avatarUrl: url } = res.account
      for (const u of users.values()) {
        if (u.accountId !== account.id) continue
        u.name = name
        u.tag = tag
        u.avatarUrl = url
      }
      io.emit('user:updated', { accountId: account.id, name, tag, avatarUrl: url })
    }
    ack(res)
  })

  socket.on('channel:create', (payload, ack) => {
    if (typeof ack !== 'function') return
    if (!user) return ack({ ok: false, error: 'Não autenticado' })
    const type: ChannelType = payload?.type === 'voice' ? 'voice' : 'text'
    const name = normalizeChannelName(payload?.name, type)
    if (!name) return ack({ ok: false, error: 'Dê um nome ao canal' })
    if (db.channels.length >= MAX_CHANNELS) return ack({ ok: false, error: 'Limite de canais atingido' })
    if (db.channels.some((c) => c.type === type && c.name.toLowerCase() === name.toLowerCase())) {
      return ack({ ok: false, error: 'Já existe um canal com esse nome' })
    }
    const channel: Channel = { id: randomUUID(), name, type, createdAt: Date.now() }
    db.channels.push(channel)
    save()
    io.emit('channel:created', channel)
    ack({ ok: true, channel })
  })

  socket.on('channel:delete', (channelId) => {
    if (!user) return
    const index = db.channels.findIndex((c) => c.id === channelId)
    if (index < 0) return
    db.channels.splice(index, 1)
    delete db.messages[channelId]
    save()
    for (const [sid, state] of voice) {
      if (state.channelId !== channelId) continue
      voice.delete(sid)
      io.sockets.sockets.get(sid)?.leave(voiceRoom(channelId))
    }
    io.emit('channel:deleted', channelId)
    emitVoice()
  })

  socket.on('message:history', (channelId, ack) => {
    if (typeof ack !== 'function') return
    ack(user ? (db.messages[channelId] ?? []) : [])
  })

  socket.on('message:send', (payload) => {
    if (!user || !payload) return
    const channel = db.channels.find((c) => c.id === payload.channelId && c.type === 'text')
    if (!channel) return
    const content = typeof payload.content === 'string' ? payload.content.trim().slice(0, MAX_MESSAGE_LENGTH) : ''
    if (!content) return
    const message: Message = {
      id: randomUUID(),
      channelId: channel.id,
      author: { ...user },
      content,
      createdAt: Date.now()
    }
    const list = (db.messages[channel.id] ??= [])
    list.push(message)
    if (list.length > MAX_HISTORY) list.splice(0, list.length - MAX_HISTORY)
    save()
    io.emit('message:new', message)
  })

  socket.on('voice:join', (payload, ack) => {
    if (typeof ack !== 'function') return
    if (!user) return ack({ ok: false, error: 'Não autenticado' })
    const channel = db.channels.find((c) => c.id === payload?.channelId && c.type === 'voice')
    if (!channel) return ack({ ok: false, error: 'Canal de voz não encontrado' })
    leaveVoice(socket)
    const peers = [...voice.values()].filter((v) => v.channelId === channel.id).map((v) => v.userId)
    voice.set(socket.id, {
      userId: socket.id,
      channelId: channel.id,
      muted: !!payload.muted,
      deafened: !!payload.deafened
    })
    socket.join(voiceRoom(channel.id))
    // Quem entra inicia a conexão WebRTC com cada pessoa que já está na sala.
    ack({ ok: true, peers })
    emitVoice()
  })

  socket.on('voice:leave', () => leaveVoice(socket))

  socket.on('voice:update', (payload) => {
    const state = voice.get(socket.id)
    if (!state) return
    state.muted = !!payload?.muted
    state.deafened = !!payload?.deafened
    emitVoice()
  })

  socket.on('voice:signal', (payload) => {
    if (!payload || typeof payload.to !== 'string') return
    const me = voice.get(socket.id)
    const other = voice.get(payload.to)
    // Só repassa sinalização entre pessoas na mesma sala de voz.
    if (!me || !other || me.channelId !== other.channelId) return
    io.to(payload.to).emit('voice:signal', { from: socket.id, data: payload.data })
  })

  socket.on('typing', (channelId) => {
    if (!user || typeof channelId !== 'string') return
    socket.broadcast.emit('typing', { channelId, userId: user.id, name: user.name })
  })

  socket.on('disconnect', () => {
    leaveVoice(socket)
    if (users.delete(socket.id)) {
      io.emit('user:left', socket.id)
      console.log(`[-] ${user?.name}#${user?.tag} saiu (${users.size} online)`)
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`\nConcord server rodando na porta ${PORT}`)
  console.log(`  Local:  http://localhost:${PORT}`)
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) console.log(`  Rede:   http://${iface.address}:${PORT}`)
    }
  }
  console.log(`  Login com Google: ${GOOGLE_CLIENT_ID ? 'ativado' : 'desativado (configure server/.env)'}`)
  console.log('')
})
