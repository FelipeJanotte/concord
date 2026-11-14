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

export const SERVER_KEY = 'concord:server'
export const TOKEN_KEY = 'concord:token'

/** Token da sessão atual (salvo no login), para as rotas HTTP que exigem login. */
export function sessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

/**
 * Endereço completo de um caminho do servidor (`/avatars/...`, `/files/...`).
 * Endereços já completos (http, data, blob) voltam como estão.
 */
export function resolveServerUrl(path: string | null | undefined, serverUrl: string | null): string | undefined {
  if (!path) return undefined
  if (/^(https?:|data:|blob:)/.test(path)) return path
  return serverUrl ? baseUrl(serverUrl) + path : undefined
}
