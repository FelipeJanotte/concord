/**
 * Servidor do Concord: contas (HTTP), canais e mensagens, lista de usuários
 * online e salas de voz (o áudio e a tela passam pelo LiveKit; aqui só sai o
 * token de acesso e a lista de quem está em cada sala).
 *
 *   npm run server          (com recarregamento automático)
 *   PORT=4000 npm run server
 *
 * Este arquivo só monta o servidor e registra os módulos. A lógica de cada
 * domínio fica em `server/modules/<dominio>.ts`; o acesso a dados, em `server/repo/`.
 */
import './env'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { networkInterfaces } from 'node:os'
import { Server } from 'socket.io'
import { accountFromToken, GOOGLE_CLIENT_ID } from './auth'
import { users, type AppServer, type ServerModule } from './context'
import { closeDatabase, databaseConfigFromEnv, describeDatabase, openDatabase } from './db/client'
import { ensureInitialData } from './db/seed'
import { sendJson } from './http'
import { liveKitConfig } from './livekit'
import { accountsModule } from './modules/accounts'
import { backupModule } from './modules/backup'
import { callsModule } from './modules/calls'
import { channelsModule } from './modules/channels'
import { messagesModule } from './modules/messages'
import { moderationModule } from './modules/moderation'
import { musicModule } from './modules/music'
import { permissionsModule } from './modules/permissions'
import { dmsModule } from './modules/dms'
import { friendsModule } from './modules/friends'
import { preferencesModule } from './modules/preferences'
import { presenceModule } from './modules/presence'
import { reactionsModule } from './modules/reactions'
import { uploadsModule } from './modules/uploads'
import { soundsModule } from './modules/sounds'
import { pollsModule } from './modules/polls'
import { toolsModule } from './modules/tools'
import { voiceModule } from './modules/voice'

const PORT = Number(process.env.PORT ?? 3001)

// Módulo novo: crie o arquivo em server/modules/ e acrescente aqui.
// A ordem importa só no `disconnect`: a voz sai antes da presença.
const modules: ServerModule[] = [
  // primeiro: carrega o acesso no boot (os outros consultam no hello)
  permissionsModule,
  accountsModule,
  uploadsModule,
  channelsModule,
  messagesModule,
  reactionsModule,
  voiceModule,
  moderationModule,
  callsModule,
  soundsModule,
  musicModule,
  preferencesModule,
  friendsModule,
  dmsModule,
  toolsModule,
  pollsModule,
  presenceModule,
  backupModule
]

// ---------- HTTP ----------

async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // O app roda em file:// (build) ou localhost:5173 (dev), então liberamos CORS.
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'content-type, authorization, x-file-name, x-sound-name, x-sound-emoji')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }

  const path = new URL(req.url ?? '/', 'http://x').pathname

  for (const mod of modules) {
    if (mod.http && (await mod.http(req, res, path))) return
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

const io: AppServer = new Server(httpServer, {
  cors: { origin: '*' },
  // fotos de perfil chegam como data URL pelo account:update
  maxHttpBufferSize: 1_000_000
})

// Só aceita conexões com uma sessão válida.
io.use((socket, next) => {
  const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token
  accountFromToken(token).then(
    (account) => {
      if (!account) return next(new Error('unauthorized'))
      socket.data.accountId = account.id
      next()
    },
    (err) => {
      // Falha do banco não é sessão inválida: o app não deve apagar o token.
      console.error('[auth]', err)
      next(new Error('server_error'))
    }
  )
})

io.on('connection', (socket) => {
  for (const mod of modules) mod.socket?.(io, socket)
})

// ---------- Inicialização ----------

async function main(): Promise<void> {
  // O banco abre (e aplica as migrations) antes de aceitar qualquer conexão.
  await openDatabase(databaseConfigFromEnv())
  const seeded = await ensureInitialData()
  if (seeded) console.log(`[banco] ${seeded}`)
  for (const mod of modules) await mod.init?.(io)

  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve))
  console.log(`\nConcord server rodando na porta ${PORT}`)
  console.log(`  Local:  http://localhost:${PORT}`)
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) console.log(`  Rede:   http://${iface.address}:${PORT}`)
    }
  }
  console.log(`  Banco: ${describeDatabase()}`)
  console.log(`  Voz (LiveKit): ${liveKitConfig ? liveKitConfig.url : 'desativada (configure LIVEKIT_* em server/.env)'}`)
  console.log(`  Login com Google: ${GOOGLE_CLIENT_ID ? 'ativado' : 'desativado (configure server/.env)'}`)
  console.log('')
}

let stopping = false
async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  console.log(`\n[${signal}] encerrando...`)
  io.close()
  await closeDatabase().catch((err) => console.error('[banco] erro ao fechar:', err))
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

main().catch(async (err) => {
  console.error('[inicialização] falhou:', err)
  await closeDatabase().catch(() => {})
  process.exit(1)
})
