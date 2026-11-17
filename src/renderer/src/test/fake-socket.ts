/**
 * Socket falso para testar as ações do renderer (`lib/actions/*`) sem servidor.
 * - `receive(evento, ...args)` simula um evento vindo do servidor;
 * - `emitted` guarda tudo que o app enviou;
 * - `replyTo(evento, fn)` define a resposta de um `emitWithAck`.
 */
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/types'
import type { AppSocket } from '@/lib/core'

type Listener = (...args: unknown[]) => void

export class FakeSocket {
  readonly emitted: { event: string; args: unknown[] }[] = []
  private listeners = new Map<string, Listener[]>()
  private replies = new Map<string, (...args: unknown[]) => unknown>()

  on(event: string, fn: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn])
    return this
  }

  /** Usados pelo `disconnect()` do `lib/client.ts`. */
  removeAllListeners(): this {
    this.listeners.clear()
    return this
  }

  connected = true
  active = false
  connectCalls = 0

  connect(): this {
    this.connectCalls++
    return this
  }

  disconnect(): this {
    this.connected = false
    return this
  }

  emit(event: string, ...args: unknown[]): this {
    this.emitted.push({ event, args })
    return this
  }

  timeout(ms: number): { emitWithAck: (event: string, ...args: unknown[]) => Promise<unknown> } {
    return {
      emitWithAck: (event, ...args) => {
        const reply = this.replies.get(event)
        if (reply) return this.emitWithAck(event, ...args)
        this.emitted.push({ event, args })
        return new Promise((_, reject) => setTimeout(() => reject(new Error('operation has timed out')), ms))
      }
    }
  }

  async emitWithAck(event: string, ...args: unknown[]): Promise<unknown> {
    this.emitted.push({ event, args })
    const reply = this.replies.get(event)
    if (!reply) throw new Error(`sem resposta configurada para "${event}"`)
    return reply(...args)
  }

  receive<E extends keyof ServerToClientEvents>(event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
    for (const fn of this.listeners.get(event) ?? []) fn(...args)
  }

  replyTo<E extends keyof ClientToServerEvents>(event: E, fn: (...args: unknown[]) => unknown): void {
    this.replies.set(event, fn)
  }

  /** Eventos enviados com aquele nome. */
  sent(event: keyof ClientToServerEvents): unknown[][] {
    return this.emitted.filter((e) => e.event === event).map((e) => e.args)
  }

  asSocket(): AppSocket {
    return this as unknown as AppSocket
  }
}
