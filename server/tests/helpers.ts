/**
 * Utilidades dos testes de integração do servidor (`server/tests/*.test.ts`): sobem o servidor de verdade (mesmo código
 * do `npm run server`) num processo separado, com porta livre e DATA_DIR
 * temporário, e conectam clientes Socket.IO tipados.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { io, type Socket } from 'socket.io-client'
import type {
  AccountInfo,
  AuthResult,
  ClientToServerEvents,
  ServerState,
  ServerToClientEvents,
  User
} from '../../src/shared/types'

const ROOT = resolve(__dirname, '../..')

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer()
    srv.once('error', rej)
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number }
      srv.close(() => res(port))
    })
  })
}

export class TestServer {
  url = ''
  private child: ChildProcess | null = null
  private output = ''

  constructor(readonly dataDir: string) {}

  /** Cria um servidor com DATA_DIR novo e vazio. */
  static async start(): Promise<TestServer> {
    const server = new TestServer(mkdtempSync(join(tmpdir(), 'concord-test-')))
    await server.boot()
    return server
  }

  async boot(): Promise<void> {
    const port = await freePort()
    this.url = `http://localhost:${port}`
    this.output = ''
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), DATA_DIR: this.dataDir, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.child = child
    child.stdout?.on('data', (d: Buffer) => (this.output += d.toString()))
    child.stderr?.on('data', (d: Buffer) => (this.output += d.toString()))

    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`servidor saiu (código ${child.exitCode}):\n${this.output}`)
      try {
        const res = await fetch(this.url + '/')
        if (res.ok) return
      } catch {
        // ainda subindo
      }
      await sleep(150)
    }
    throw new Error(`servidor não respondeu em 20 s:\n${this.output}`)
  }

  /** Para o processo. Espera o salvamento atrasado do db.json (500 ms) antes. */
  async stop({ waitForSave = true } = {}): Promise<void> {
    const child = this.child
    if (!child) return
    if (waitForSave) await sleep(800)
    this.child = null
    if (child.exitCode !== null) return
    const exited = new Promise((res) => child.once('exit', res))
    child.kill()
    await exited
  }

  /** Reinicia sobre o mesmo DATA_DIR (testa persistência). */
  async restart(): Promise<void> {
    await this.stop()
    await this.boot()
  }

  /** Para e apaga o DATA_DIR. */
  async destroy(): Promise<void> {
    await this.stop({ waitForSave: false })
    rmSync(this.dataDir, { recursive: true, force: true })
  }

  /** Log do servidor (útil para depurar um teste que falhou). */
  get log(): string {
    return this.output
  }

  // ---------- HTTP ----------

  async post<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    return (await res.json()) as T
  }

  register(body: { email: string; password: string; name: string; tag: string }): Promise<AuthResult> {
    return this.post<AuthResult>('/auth/register', body)
  }

  login(email: string, password: string): Promise<AuthResult> {
    return this.post<AuthResult>('/auth/login', { email, password })
  }

  // ---------- Socket ----------

  /** Conecta com um token. Rejeita com o erro do handshake (ex.: `unauthorized`). */
  connect(token: string): Promise<ClientSocket> {
    return new Promise((res, rej) => {
      const s: ClientSocket = io(this.url, { transports: ['websocket'], auth: { token }, reconnection: false, forceNew: true })
      s.once('connect', () => res(s))
      s.once('connect_error', (err) => {
        s.close()
        rej(err)
      })
    })
  }

  /** Cria uma conta nova, conecta e manda `hello`. */
  async newUser(name = 'Pessoa'): Promise<TestUser> {
    const creds = uniqueCredentials(name)
    const result = await this.register(creds)
    if (!result.ok) throw new Error(`cadastro falhou: ${result.error}`)
    const socket = await this.connect(result.token)
    const hello = await socket.emitWithAck('hello')
    return { ...creds, token: result.token, socket, self: hello.self, account: hello.account, state: hello.state }
  }
}

export interface TestUser {
  email: string
  password: string
  name: string
  tag: string
  token: string
  socket: ClientSocket
  self: User
  account: AccountInfo
  state: ServerState
}

/** E-mail e id (tag) únicos para não colidir entre testes. */
export function uniqueCredentials(name = 'Pessoa'): { email: string; password: string; name: string; tag: string } {
  const tag = randomBytes(4).toString('hex').slice(0, 5)
  return { email: `${tag}@teste.com`, password: 'senha-forte-123', name, tag }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

type ServerEvent = keyof ServerToClientEvents
type EventArgs<E extends ServerEvent> = Parameters<ServerToClientEvents[E]>

/**
 * Espera um evento do servidor (opcionalmente um que satisfaça `match`).
 * Rejeita depois de `ms` milissegundos.
 */
export function waitFor<E extends ServerEvent>(
  socket: ClientSocket,
  event: E,
  match: (...args: EventArgs<E>) => boolean = () => true,
  ms = 3000
): Promise<EventArgs<E>> {
  const s = socket as unknown as {
    on(e: string, fn: (...a: unknown[]) => void): void
    off(e: string, fn: (...a: unknown[]) => void): void
  }
  const promise = new Promise<EventArgs<E>>((res, rej) => {
    const timer = setTimeout(() => {
      s.off(event, listener)
      rej(new Error(`timeout esperando "${event}"`))
    }, ms)
    const listener = (...args: unknown[]): void => {
      if (!match(...(args as EventArgs<E>))) return
      clearTimeout(timer)
      s.off(event, listener)
      res(args as EventArgs<E>)
    }
    s.on(event, listener)
  })
  return handled(promise)
}

/**
 * Os testes criam a espera antes de disparar a ação e só depois dão `await`.
 * Marca a promise como tratada para uma falha nesse meio-tempo não virar
 * "unhandled rejection"; o `await` continua recebendo o erro.
 */
function handled<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {})
  return promise
}

/** Garante que um evento NÃO chega dentro de `ms`. */
export function expectNoEvent<E extends ServerEvent>(
  socket: ClientSocket,
  event: E,
  match: (...args: EventArgs<E>) => boolean = () => true,
  ms = 400
): Promise<void> {
  return handled(
    waitFor(socket, event, match, ms).then(
      () => {
        throw new Error(`evento "${event}" não deveria ter chegado`)
      },
      () => undefined
    )
  )
}
