/**
 * Contas: rotas HTTP de cadastro/login/fotos e o evento `account:update`.
 * As regras ficam em `server/auth.ts` (skill `concord-accounts`).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AuthConfig, ProfileChange } from '../../src/shared/types'
import { findAccount, GOOGLE_CLIENT_ID, googleLogin, login, register, revokeSession, updateProfile } from '../auth'
import { guard, users, type ServerModule } from '../context'
import { AVATAR_DIR, CUSTOM_STATUS_SWEEP_INTERVAL_MS, SESSION_SWEEP_INTERVAL_MS } from '../config'
import { clientIp, readJson, sendJson } from '../http'
import { limiters, pruneAllLimiters, retryText } from '../middleware/rate-limit'
import { clearExpiredCustomStatuses } from '../repo/accounts'
import { deleteExpiredSessions } from '../repo/sessions'

async function clearExpiredStatuses(): Promise<void> {
  const cleared = new Set(await clearExpiredCustomStatuses(Date.now()))
  for (const u of users.values()) {
    if (cleared.has(u.accountId)) u.customStatus = null
  }
}

export const accountsModule: ServerModule = {
  async http(req, res, path) {
    if (req.method === 'GET' && path === '/auth/config') {
      sendJson(res, 200, { googleClientId: GOOGLE_CLIENT_ID } satisfies AuthConfig)
      return true
    }

    if (req.method === 'GET' && path.startsWith('/avatars/')) {
      const account = await findAccount(path.slice('/avatars/'.length))
      const file = account ? join(AVATAR_DIR, account.id) : ''
      if (!account?.avatarType || !existsSync(file)) {
        res.writeHead(404).end()
        return true
      }
      res.writeHead(200, {
        'content-type': account.avatarType,
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=31536000, immutable'
      })
      res.end(readFileSync(file))
      return true
    }

    if (req.method !== 'POST' || !path.startsWith('/auth/')) return false
    let body: Record<string, unknown>
    try {
      body = await readJson(req)
    } catch {
      sendJson(res, 400, { ok: false, error: 'Requisição inválida' })
      return true
    }
    const limit = (name: 'register' | 'login'): boolean => {
      const result = limiters[name].take(clientIp(req))
      if (result.ok) return false
      res.setHeader('retry-after', String(Math.ceil(result.retryAfterMs / 1000)))
      sendJson(res, 429, { ok: false, error: `Muitas tentativas deste computador. ${retryText(result.retryAfterMs)}` })
      return true
    }
    switch (path) {
      case '/auth/register':
        if (limit('register')) return true
        sendJson(res, 200, await register(body))
        return true
      case '/auth/login':
        if (limit('login')) return true
        sendJson(res, 200, await login(body))
        return true
      case '/auth/google':
        if (limit('login')) return true
        sendJson(res, 200, await googleLogin(body))
        return true
      case '/auth/logout':
        await revokeSession(body.token)
        sendJson(res, 200, { ok: true })
        return true
    }
    return false
  },

  socket(io, socket) {
    socket.on('account:update', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('account:update', async () => {
        const account = await findAccount(socket.data.accountId)
        if (!socket.data.user || !account) return ack({ ok: false, error: 'Não autenticado' })
        const limited = limiters.profile.take(account.id)
        if (!limited.ok) return ack({ ok: false, error: `Muitas alterações seguidas. ${retryText(limited.retryAfterMs)}` })
        const res = await updateProfile(account, payload ?? {})
        if (res.ok) {
          const { name, tag, avatarUrl, bio, customStatus } = res.account
          const change: ProfileChange = { accountId: account.id, name, tag, avatarUrl, bio, customStatus }
          for (const u of users.values()) {
            if (u.accountId === account.id) Object.assign(u, change)
          }
          io.emit('user:updated', change)
        }
        ack(res)
      })
    })
  },

  init() {
    // Sessões vencidas e baldes de limite cheios são limpos de tempos em tempos.
    const cleanup = (): void => {
      pruneAllLimiters()
      deleteExpiredSessions().then(
        (n) => n && console.log(`[sessões] ${n} sessão(ões) vencida(s) apagada(s)`),
        (err) => console.error('[sessões] limpeza falhou:', err)
      )
    }
    cleanup()
    setInterval(cleanup, SESSION_SWEEP_INTERVAL_MS).unref()
    setInterval(() => void guard('custom-status:sweep', clearExpiredStatuses), CUSTOM_STATUS_SWEEP_INTERVAL_MS).unref()
  }
}
