/**
 * Tipos e estado compartilhados pelos módulos do servidor.
 *
 * Cada domínio vive em `server/modules/<dominio>.ts` e exporta um `ServerModule`.
 * O `server/index.ts` só registra a lista de módulos.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Server, Socket } from 'socket.io'
import type { ClientToServerEvents, ServerToClientEvents, User } from '../src/shared/types'

export interface SocketData {
  /** conta dona do socket (vem do token, definido no handshake) */
  accountId: string
  /** definido depois do `hello`; handlers que exigem login conferem se existe */
  user?: User
}

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>
export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

export interface ServerModule {
  /** Responde as rotas HTTP do módulo. Devolve true se tratou a requisição. */
  http?: (req: IncomingMessage, res: ServerResponse, path: string) => Promise<boolean>
  /** Registra os handlers de um socket recém-conectado (já autenticado). */
  socket?: (io: AppServer, socket: AppSocket) => void
  /** Roda uma vez no boot, com o banco já aberto (ex.: tarefas periódicas). */
  init?: (io: AppServer) => void | Promise<void>
}

/** Quem está online: socket.id → usuário (uma conta pode ter várias conexões). */
export const users = new Map<string, User>()

/**
 * Roda um handler async sem deixar um erro virar `unhandledRejection` (que
 * derrubaria o servidor). Uso: `socket.on('x', (p) => void guard('x', async () => { ... }))`.
 */
export async function guard(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`[${label}]`, err)
  }
}
