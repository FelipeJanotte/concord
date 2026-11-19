/**
 * Preferências da conta (v5, contrato em src/shared/types/preferences.ts e theme.ts):
 * tema ativo e até 10 temas salvos. Tudo é validado com as funções puras do contrato
 * (`validateTheme`, `cleanThemeName`) antes de gravar; mudar numa janela avisa as
 * outras conexões da mesma conta (`preferences:updated`).
 */
import {
  cleanThemeName,
  MUTED_CHANNELS_MAX,
  SAVED_THEMES_MAX,
  validateTheme,
  type PreferencesUpdate,
  type SavedTheme
} from '../../src/shared/types'
import { guard, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { getPreferences, updatePreferences } from '../repo/preferences'
import { isUuid } from '../repo/util'
import { setDoNotDisturb } from './presence'

/** Valida a lista de temas salvos inteira; null se algo estiver errado. */
function cleanSavedThemes(raw: unknown): SavedTheme[] | null {
  if (!Array.isArray(raw) || raw.length > SAVED_THEMES_MAX) return null
  const seen = new Set<string>()
  const out: SavedTheme[] = []
  for (const item of raw) {
    const entry = item as Partial<SavedTheme> | null
    const name = cleanThemeName(entry?.name)
    const theme = validateTheme(entry?.theme)
    if (!entry || !isUuid(entry.id) || seen.has(entry.id) || !name || !theme) return null
    seen.add(entry.id)
    out.push({ id: entry.id, name, theme })
  }
  return out
}

function cleanMutedChannels(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const unique = [...new Set(raw)]
  if (unique.length > MUTED_CHANNELS_MAX || !unique.every(isUuid)) return null
  return unique
}

export const preferencesModule: ServerModule = {
  socket(io, socket) {
    socket.on('preferences:get', (ack) => {
      if (typeof ack !== 'function') return
      void guard('preferences:get', async () => {
        ack(await getPreferences(socket.data.accountId))
      })
    })

    socket.on('preferences:update', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('preferences:update', async () => {
        const user = socket.data.user
        if (!user) return ack({ ok: false, error: 'Não autenticado' })
        const update: PreferencesUpdate = {}
        if (payload?.theme !== undefined) {
          const theme = validateTheme(payload.theme)
          if (!theme) return ack({ ok: false, error: 'Tema inválido' })
          update.theme = theme
        }
        if (payload?.savedThemes !== undefined) {
          const saved = cleanSavedThemes(payload.savedThemes)
          if (!saved) return ack({ ok: false, error: `Temas salvos inválidos (até ${SAVED_THEMES_MAX}, cada um com nome e tema válidos)` })
          update.savedThemes = saved
        }
        if (payload?.mutedChannels !== undefined) {
          const muted = cleanMutedChannels(payload.mutedChannels)
          if (!muted) return ack({ ok: false, error: `Canais silenciados inválidos (até ${MUTED_CHANNELS_MAX})` })
          update.mutedChannels = muted
        }
        if (payload?.doNotDisturb !== undefined) {
          if (typeof payload.doNotDisturb !== 'boolean') return ack({ ok: false, error: 'Não perturbe inválido' })
          update.doNotDisturb = payload.doNotDisturb
        }
        if (Object.keys(update).length === 0) return ack({ ok: false, error: 'Nada para mudar' })
        const limited = limiters.preferences.take(user.accountId)
        if (!limited.ok) return ack({ ok: false, error: `Muitas alterações seguidas. ${retryText(limited.retryAfterMs)}` })

        const preferences = await updatePreferences(user.accountId, update)
        if (update.doNotDisturb !== undefined) setDoNotDisturb(io, user.accountId, update.doNotDisturb)
        // as outras janelas da mesma conta mudam junto
        for (const other of io.sockets.sockets.values()) {
          if (other.id !== socket.id && other.data.user?.accountId === user.accountId) other.emit('preferences:updated', preferences)
        }
        ack({ ok: true, preferences })
      })
    })
  }
}
