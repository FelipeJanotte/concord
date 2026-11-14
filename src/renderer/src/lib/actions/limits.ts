// Avisos de limite de requisições (o servidor recusou uma ação rápida demais).
import type { LimitedAction } from '@shared/types'
import { notify, type AppSocket } from '../core'

const MESSAGES: Record<LimitedAction, string> = {
  message: 'Você está mandando mensagens rápido demais.',
  typing: 'Calma aí!'
}

export function limitNotice(action: LimitedAction, retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return `${MESSAGES[action]} Espere ${seconds} s.`
}

export function bindLimitEvents(s: AppSocket): void {
  s.on('rate:limited', ({ action, retryAfterMs }) => notify(limitNotice(action, retryAfterMs), 'info'))
}
