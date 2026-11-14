/**
 * Peças compartilhadas pelas ações: o socket atual, atalhos da store e avisos.
 * Componentes não importam daqui; eles usam `@/lib/client`.
 */
import type { Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/types'
import { useApp } from '@/store'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let current: AppSocket | null = null

export const set = useApp.setState
export const get = useApp.getState

export function getSocket(): AppSocket | null {
  return current
}

export function setSocket(socket: AppSocket | null): void {
  current = socket
}

export function requireSocket(): AppSocket {
  if (!current) throw new Error('Sem conexão com o servidor')
  return current
}

export function notify(text: string, kind: 'error' | 'info' = 'error'): void {
  set({ notice: { id: Date.now(), text, kind } })
}

export const baseUrl = (url: string): string => url.trim().replace(/\/+$/, '')
