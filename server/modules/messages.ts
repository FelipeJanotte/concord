// Mensagens dos canais de texto e das conversas privadas, "digitando", editar (A15) e responder citando (B18).
import { randomUUID } from 'node:crypto'
import {
  ATTACHMENTS_PER_MESSAGE,
  canPinMessages,
  EVERYONE_TOKEN,
  MESSAGE_MAX_LENGTH,
  PINS_PER_CHANNEL_MAX,
  SEARCH_QUERY_MAX,
  type ChannelKind,
  type Message,
  type OkResult,
  type User
} from '../../src/shared/types'
import { allowed, currentAccess, dmChannelsOf, dmMembersOf, emitToViewers, visibleChannels } from '../access'
import { signMessage } from '../files-signing'
import { guard, type AppServer, type ServerModule } from '../context'
import { limiters, retryText } from '../middleware/rate-limit'
import { findChannel, listChannels } from '../repo/channels'
import {
  countPins,
  editMessage,
  findEditable,
  findPinState,
  findReplyTarget,
  insertMessage,
  listMessages,
  listPins,
  resolveMentions,
  searchMessages,
  setPinned
} from '../repo/messages'
import { isUuid } from '../repo/util'
import { timeoutRefusal } from './timeouts'

/** Sem a permissão `mentionEveryone`, o `<@todos>` vira texto comum (B19): ninguém é avisado. */
async function checkEveryone(accountId: string, content: string): Promise<string> {
  if (!content.toLowerCase().includes(EVERYONE_TOKEN)) return content
  if (await allowed(accountId, 'mentionEveryone')) return content
  return content.replace(/<@todos>/gi, '@todos')
}

export async function mentionSafeContent(accountId: string, channelType: ChannelKind, content: string): Promise<string> {
  return channelType === 'dm' ? content.replace(/<@todos>/gi, '@todos') : checkEveryone(accountId, content)
}

async function searchableChannels(accountId: string, channelId: unknown): Promise<string[]> {
  if (typeof channelId === 'string') return (await allowed(accountId, 'view', channelId)) ? [channelId] : []
  const community = visibleChannels(await currentAccess(), accountId, await listChannels()).map((c) => c.id)
  return [...community, ...dmChannelsOf(accountId)]
}

async function mayPin(accountId: string, channelId: string): Promise<boolean> {
  if (dmMembersOf(channelId)) return true
  return canPinMessages(await currentAccess(), accountId)
}

async function postPinNotice(io: AppServer, user: User, channelId: string, messageId: string): Promise<void> {
  const replyTo = await findReplyTarget(messageId, channelId)
  const notice: Message = {
    id: randomUUID(),
    channelId,
    author: { ...user },
    content: '',
    attachments: [],
    createdAt: Date.now(),
    kind: 'pin',
    ...(replyTo ? { replyTo } : {})
  }
  const saved = await insertMessage(notice)
  if (saved) await emitToViewers(io, channelId, 'message:new', saved)
}

export const messagesModule: ServerModule = {
  socket(io, socket) {
    // Mensagens de uma mesma conexão são gravadas e repassadas na ordem em que chegaram.
    let queue: Promise<void> = Promise.resolve()

    socket.on('message:history', (req, ack) => {
      if (typeof ack !== 'function') return
      void guard('message:history', async () => {
        const channelId = req?.channelId
        const user = socket.data.user
        if (!user || typeof channelId !== 'string') return ack({ messages: [], hasMore: false })
        // sem permissão de ver: igual a canal inexistente
        if (!(await allowed(user.accountId, 'view', channelId))) return ack({ messages: [], hasMore: false })
        const cursor = (key: 'before' | 'after' | 'around'): string | undefined => (typeof req[key] === 'string' ? req[key] : undefined)
        const page = await listMessages(channelId, { before: cursor('before'), after: cursor('after'), around: cursor('around') })
        // links dos anexos assinados para esta conta
        ack({ ...page, messages: page.messages.map((m) => signMessage(m, user.accountId)) })
      })
    })

    socket.on('message:send', (payload, ack) => {
      const reply = (res: OkResult): void => {
        if (typeof ack === 'function') ack(res)
      }
      const refuse = (error: string): void => reply({ ok: false, error })
      const user = socket.data.user
      if (!user || !payload || typeof payload.channelId !== 'string') return refuse('Mensagem inválida')
      const content = typeof payload.content === 'string' ? payload.content.trim().slice(0, MESSAGE_MAX_LENGTH) : ''
      const attachmentIds = payload.attachmentIds ?? []
      if (
        !Array.isArray(attachmentIds) ||
        attachmentIds.length > ATTACHMENTS_PER_MESSAGE ||
        !attachmentIds.every(isUuid) ||
        new Set(attachmentIds).size !== attachmentIds.length
      ) {
        return refuse('Anexos inválidos')
      }
      if (!content && attachmentIds.length === 0) return refuse('Mensagem vazia')
      const timedOut = timeoutRefusal(user.accountId)
      if (timedOut) return refuse(timedOut)
      const limited = limiters.message.take(user.accountId)
      if (!limited.ok) {
        socket.emit('rate:limited', { action: 'message', retryAfterMs: limited.retryAfterMs })
        return refuse(`Muitas mensagens seguidas. ${retryText(limited.retryAfterMs)}`)
      }
      const { channelId } = payload
      const replyToId = typeof payload.replyToId === 'string' ? payload.replyToId : undefined
      queue = queue.then(() =>
        guard('message:send', async () => {
          // canal de texto, chat da sala de voz (como no Discord) ou conversa privada (v3)
          const channel = await findChannel(channelId)
          if (!channel || !(await allowed(user.accountId, 'view', channel.id))) return refuse('Canal não encontrado')
          if (!(await allowed(user.accountId, 'send', channel.id))) return refuse('Você não tem permissão para enviar mensagens neste canal')
          if (attachmentIds.length > 0 && !(await allowed(user.accountId, 'attach', channel.id))) {
            return refuse('Você não tem permissão para anexar arquivos neste canal')
          }
          // resposta (B18): só a uma mensagem do mesmo canal; inválida = vai sem a citação
          const replyTo = replyToId ? await findReplyTarget(replyToId, channel.id) : undefined
          // menções (B19): @todos só com permissão; numa conversa privada não há @todos
          const text = await mentionSafeContent(user.accountId, channel.type, content)
          const message: Message = {
            id: randomUUID(),
            channelId: channel.id,
            author: { ...user },
            content: text,
            attachments: [],
            createdAt: Date.now(),
            ...(replyTo ? { replyTo } : {})
          }
          // null = algum anexo não é desta pessoa ou já foi usado: nada é gravado.
          const saved = await insertMessage(message, attachmentIds)
          if (!saved) return refuse('Anexos inválidos')
          reply({ ok: true })
          await emitToViewers(io, channel.id, 'message:new', { ...saved, ...(await resolveMentions(text)) }, { forAccount: signMessage })
        })
      )
    })

    // Editar (A15): só o autor, só mensagem de texto, e ainda podendo ver e mandar mensagens no canal.
    socket.on('message:edit', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('message:edit', async () => {
        const user = socket.data.user
        if (!user) return ack({ ok: false, error: 'Não autenticado' })
        if (typeof payload?.messageId !== 'string' || typeof payload.content !== 'string') return ack({ ok: false, error: 'Pedido inválido' })
        const raw = payload.content.trim()
        if (raw.length > MESSAGE_MAX_LENGTH) return ack({ ok: false, error: `A mensagem pode ter no máximo ${MESSAGE_MAX_LENGTH} caracteres` })
        const meta = await findEditable(payload.messageId)
        // sem ver o canal: igual a mensagem inexistente
        if (!meta || !(await allowed(user.accountId, 'view', meta.channelId))) return ack({ ok: false, error: 'Mensagem não encontrada' })
        if (meta.authorId !== user.accountId || meta.kind !== 'text') return ack({ ok: false, error: 'Você só pode editar as suas mensagens' })
        if (!(await allowed(user.accountId, 'send', meta.channelId))) return ack({ ok: false, error: 'Você não pode enviar mensagens neste canal' })
        const content = await checkEveryone(user.accountId, raw)
        if (!content && meta.attachments === 0) return ack({ ok: false, error: 'A mensagem não pode ficar vazia (para tirar, apague)' })
        if (content === meta.content) return ack({ ok: true })
        const limited = limiters.message.take(user.accountId)
        if (!limited.ok) return ack({ ok: false, error: 'Muitas mensagens seguidas. Espere um pouco.' })
        const editedAt = await editMessage(payload.messageId, user.accountId, content)
        if (editedAt === null) return ack({ ok: false, error: 'Mensagem não encontrada' })
        await emitToViewers(io, meta.channelId, 'message:edited', {
          channelId: meta.channelId,
          messageId: payload.messageId,
          content,
          editedAt,
          ...(await resolveMentions(content))
        })
        ack({ ok: true })
      })
    })

    socket.on('message:search', (req, ack) => {
      if (typeof ack !== 'function') return
      void guard('message:search', async () => {
        const user = socket.data.user
        if (!user) return ack({ ok: false, error: 'Não autenticado' })
        if (!req || typeof req.query !== 'string') return ack({ ok: false, error: 'Pedido inválido' })
        const query = req.query.trim()
        const authorId = typeof req.authorId === 'string' ? req.authorId : undefined
        if (query.length > SEARCH_QUERY_MAX) return ack({ ok: false, error: `A busca pode ter no máximo ${SEARCH_QUERY_MAX} caracteres` })
        if (!query && !authorId) return ack({ ok: false, error: 'Digite o que buscar' })
        const limited = limiters.search.take(user.accountId)
        if (!limited.ok) return ack({ ok: false, error: `Muitas buscas seguidas. ${retryText(limited.retryAfterMs)}` })
        const channelIds = await searchableChannels(user.accountId, req.channelId)
        const before = typeof req.before === 'string' ? req.before : undefined
        const page = await searchMessages({ channelIds, query, authorId, before })
        ack({ ok: true, ...page, messages: page.messages.map((m) => signMessage(m, user.accountId)) })
      })
    })

    socket.on('message:pins', (req, ack) => {
      if (typeof ack !== 'function') return
      void guard('message:pins', async () => {
        const user = socket.data.user
        const channelId = req?.channelId
        if (!user || typeof channelId !== 'string' || !(await allowed(user.accountId, 'view', channelId))) return ack([])
        ack((await listPins(channelId)).map((m) => signMessage(m, user.accountId)))
      })
    })

    socket.on('message:pin', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('message:pin', async () => {
        const user = socket.data.user
        if (!user) return ack({ ok: false, error: 'Não autenticado' })
        if (typeof payload?.messageId !== 'string' || typeof payload.on !== 'boolean') return ack({ ok: false, error: 'Pedido inválido' })
        const { messageId, on } = payload
        const target = await findPinState(messageId)
        if (!target || !(await allowed(user.accountId, 'view', target.channelId))) return ack({ ok: false, error: 'Mensagem não encontrada' })
        if (target.kind === 'pin') return ack({ ok: false, error: 'Essa mensagem não pode ser fixada' })
        if (!(await mayPin(user.accountId, target.channelId))) return ack({ ok: false, error: 'Você não tem permissão para fixar mensagens' })
        if (target.pinned === on) return ack({ ok: true })
        const limited = limiters.pin.take(user.accountId)
        if (!limited.ok) return ack({ ok: false, error: `Muitas ações seguidas. ${retryText(limited.retryAfterMs)}` })
        if (on && (await countPins(target.channelId)) >= PINS_PER_CHANNEL_MAX) {
          return ack({ ok: false, error: `Este canal já tem ${PINS_PER_CHANNEL_MAX} mensagens fixadas` })
        }
        const pinnedAt = await setPinned(messageId, on ? user.accountId : null)
        await emitToViewers(io, target.channelId, 'message:pinned', { channelId: target.channelId, messageId, pinnedAt })
        if (on) await postPinNotice(io, user, target.channelId, messageId)
        ack({ ok: true })
      })
    })

    socket.on('typing', (channelId) => {
      const user = socket.data.user
      if (!user || typeof channelId !== 'string') return
      if (!limiters.typing.take(socket.id).ok) return // excesso de "digitando": só ignora
      void guard('typing', async () => {
        if (!(await allowed(user.accountId, 'send', channelId))) return
        await emitToViewers(io, channelId, 'typing', { channelId, userId: user.id, name: user.name }, { exceptSocketId: socket.id })
      })
    })
  }
}
