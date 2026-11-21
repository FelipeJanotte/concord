import {
  MAX_CATEGORIES,
  normalizeCategoryName,
  parseLayout,
  type CategoryResult,
  type OkResult
} from '../../src/shared/types'
import { allowed, currentAccess, visibleChannels } from '../access'
import { guard, type AppServer, type AppSocket, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { recordAudit } from '../repo/audit'
import {
  countCategories,
  deleteCategory,
  findCategory,
  insertCategory,
  listCategories,
  renameCategory,
  saveLayout
} from '../repo/categories'
import { listChannels } from '../repo/channels'

const LAYOUT_CHANGED = 'A lista de canais mudou. Tente de novo.'
const NO_CATEGORY = 'Essa categoria não existe'

async function emitLayout(io: AppServer): Promise<void> {
  const [access, categories, channels] = await Promise.all([currentAccess(), listCategories(), listChannels()])
  for (const socket of io.sockets.sockets.values()) {
    const user = socket.data.user
    if (!user) continue
    const visible = visibleChannels(access, user.accountId, channels).map((c) => ({
      id: c.id,
      categoryId: c.categoryId ?? null,
      position: c.position ?? 0
    }))
    socket.emit('channels:layout', { categories, channels: visible })
  }
}

async function refusal(socket: AppSocket): Promise<string | null> {
  const user = socket.data.user
  if (!user) return 'Não autenticado'
  if (!(await allowed(user.accountId, 'manageChannels'))) return 'Você não tem permissão para gerenciar canais'
  const limited = limiters.channelLayout.take(user.accountId)
  return limited.ok ? null : `Muitas mudanças seguidas. ${retryText(limited.retryAfterMs)}`
}

export const categoriesModule: ServerModule = {
  socket(io, socket) {
    const handle = <P, R extends OkResult | CategoryResult>(event: string, run: (payload: P, actorId: string) => Promise<R>) =>
      (payload: P, ack: (res: R) => void): void => {
        if (typeof ack !== 'function') return
        void guard(event, async () => {
          const error = await refusal(socket)
          const actorId = socket.data.user?.accountId
          if (error || !actorId) return ack({ ok: false, error: error ?? 'Não autenticado' } as R)
          const res = await run(payload, actorId)
          ack(res)
          if (res.ok) await emitLayout(io)
        })
      }

    socket.on(
      'category:create',
      handle<{ name: string } | undefined, CategoryResult>('category:create', async (payload, actorId) => {
        const name = normalizeCategoryName(payload?.name)
        if (!name) return { ok: false, error: 'Dê um nome à categoria' }
        if ((await countCategories()) >= MAX_CATEGORIES) return { ok: false, error: 'Limite de categorias atingido' }
        const category = await insertCategory(name)
        await recordAudit({ actorId, action: 'category-create', targetId: category.id, details: { name } })
        return { ok: true, category }
      })
    )

    socket.on(
      'category:rename',
      handle<{ categoryId: string; name: string } | undefined, CategoryResult>('category:rename', async (payload, actorId) => {
        const name = normalizeCategoryName(payload?.name)
        if (!name) return { ok: false, error: 'Dê um nome à categoria' }
        const previous = await findCategory(String(payload?.categoryId))
        const category = previous && (await renameCategory(previous.id, name))
        if (!previous || !category) return { ok: false, error: NO_CATEGORY }
        await recordAudit({ actorId, action: 'category-rename', targetId: category.id, details: { name, previousName: previous.name } })
        return { ok: true, category }
      })
    )

    socket.on(
      'category:delete',
      handle<{ categoryId: string } | undefined, OkResult>('category:delete', async (payload, actorId) => {
        const category = await findCategory(String(payload?.categoryId))
        if (!category || !(await deleteCategory(category.id))) return { ok: false, error: NO_CATEGORY }
        await recordAudit({ actorId, action: 'category-delete', targetId: category.id, details: { name: category.name } })
        return { ok: true }
      })
    )

    socket.on(
      'channel:layout',
      handle<unknown, OkResult>('channel:layout', async (payload, actorId) => {
        const [categories, channels] = await Promise.all([listCategories(), listChannels()])
        const layout = parseLayout(payload, { categoryIds: categories.map((c) => c.id), channelIds: channels.map((c) => c.id) })
        if (!layout) return { ok: false, error: LAYOUT_CHANGED }
        try {
          await saveLayout(layout.categories, layout.channels)
        } catch {
          return { ok: false, error: LAYOUT_CHANGED }
        }
        await recordAudit({ actorId, action: 'channel-layout', targetId: null, details: {} })
        return { ok: true }
      })
    )
  }
}

