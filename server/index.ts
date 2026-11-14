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
import { sendJson } from './http'
import { liveKitConfig } from './livekit'
import { accountsModule } from './modules/accounts'
import { channelsModule } from './modules/channels'
import { messagesModule } from './modules/messages'
import { presenceModule } from './modules/presence'
import { voiceModule } from './modules/voice'

const PORT = Number(process.env.PORT ?? 3001)

// Módulo novo: crie o arquivo em server/modules/ e acrescente aqui.
// A ordem importa só no `disconnect`: a voz sai antes da presença.
const modules: ServerModule[] = [accountsModule, channelsModule, messagesModule, voiceModule, presenceModule]

// ---------- HTTP ----------

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

httpServer.listen(PORT, () => {
  console.log(`\nConcord server rodando na porta ${PORT}`)
  console.log(`  Local:  http://localhost:${PORT}`)
  for (const list of Object.values(networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) console.log(`  Rede:   http://${iface.address}:${PORT}`)
    }
  }
  console.log(`  Voz (LiveKit): ${liveKitConfig ? liveKitConfig.url : 'desativada (configure LIVEKIT_* em server/.env)'}`)
  console.log(`  Login com Google: ${GOOGLE_CLIENT_ID ? 'ativado' : 'desativado (configure server/.env)'}`)
  console.log('')
})
