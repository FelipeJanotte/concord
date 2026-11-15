/**
 * Salas de voz: valida a entrada, emite o token do LiveKit (o áudio e a tela passam
 * pelo LiveKit, não por aqui) e mantém a lista de quem está em cada sala. Skill `concord-voice`.
 *
 * Permissões (v2, skill `concord-permissions`): entrar exige `view` + `connect`; o token
 * sai com microfone se `speak` e tela se `share`; cada um só vê o `voice:state` das salas
 * que pode ver; `applyVoiceAccess` reaplica tudo quando cargos ou regras mudam.
 *
 * Moderação (B6, `server/modules/moderation.ts`): `kickFromVoice` tira uma conexão da sala e
 * `setServerMuted` silencia uma conta para todos (entra no cálculo do `speak`, então vale no
 * token, ao vivo no LiveKit e se a pessoa sair e voltar).
 */
import { can, channelPermissions, type AccessState, type VoicePermissions, type VoiceState } from '../../src/shared/types'
import { accessSnapshot, allowed, currentAccess } from '../access'
import { guard, type AppServer, type AppSocket, type ServerModule } from '../context'
import { closeRoom, createVoiceCredentials, kickFromRoom, liveKitConfig, updateVoicePermissions } from '../livekit'
import { findChannel } from '../repo/channels'

/** socket.id → estado de voz */
const voice = new Map<string, VoiceState>()
/** socket.id → o que o token/LiveKit permite publicar agora (para só atualizar o que mudou) */
const published = new Map<string, VoicePermissions>()
/** contas silenciadas por um moderador (B6). Em memória: some se o servidor reiniciar. */
const serverMuted = new Set<string>()

export const voiceStates = (): VoiceState[] => [...voice.values()]

function voicePermissions(access: AccessState, accountId: string, channelId: string): VoicePermissions {
  const perms = channelPermissions(access, accountId, channelId)
  return { canSpeak: perms.has('speak') && !serverMuted.has(accountId), canShare: perms.has('share') }
}

/** Sala de voz em que a conexão está (ou undefined). */
export function voiceChannelOf(socketId: string): string | undefined {
  return voice.get(socketId)?.channelId
}

/** Conexões que estão na sala de voz `channelId`. */
export function voiceSocketsIn(channelId: string): string[] {
  return voiceStates()
    .filter((v) => v.channelId === channelId)
    .map((v) => v.userId)
}

/** Estado de voz que a conta pode ver (quem está em sala privada não aparece para quem não vê a sala). */
export function voiceStatesFor(accountId: string): VoiceState[] {
  const access = accessSnapshot()
  return voiceStates().filter((v) => can(access, accountId, 'view', v.channelId))
}

/** `voice:state` (sempre a lista completa que cada conexão pode ver). */
export function emitVoice(io: AppServer): void {
  for (const socket of io.sockets.sockets.values()) {
    const user = socket.data.user
    if (user) socket.emit('voice:state', voiceStatesFor(user.accountId))
  }
}

/**
 * Ponto único chamado depois de qualquer mudança de cargos/membros/regras (A4):
 * quem perdeu `view`/`connect` sai da sala (e do LiveKit); quem continua tem
 * `speak`/`share` atualizados ao vivo no LiveKit (sem `speak` fica silenciado, sem
 * `share` a tela para). No fim, cada um recebe o `voice:state` das salas que vê.
 */
export function applyVoiceAccess(io: AppServer, access: AccessState): void {
  for (const state of voiceStates()) {
    const socket = io.sockets.sockets.get(state.userId)
    const accountId = socket?.data.user?.accountId
    if (!socket || !accountId) continue
    if (!can(access, accountId, 'connect', state.channelId)) {
      leaveVoice(io, socket, { emit: false })
      continue
    }
    state.serverMuted = serverMuted.has(accountId)
    const next = voicePermissions(access, accountId, state.channelId)
    const before = published.get(socket.id)
    if (before && before.canSpeak === next.canSpeak && before.canShare === next.canShare) continue
    published.set(socket.id, next)
    if (!next.canSpeak) state.muted = true
    if (!next.canShare) state.sharing = false
    if (liveKitConfig) void updateVoicePermissions(liveKitConfig, state.channelId, socket.id, next)
  }
  emitVoice(io)
}

function leaveVoice(io: AppServer, socket: AppSocket, { emit = true } = {}): void {
  const state = voice.get(socket.id)
  if (!state) return
  voice.delete(socket.id)
  published.delete(socket.id)
  if (liveKitConfig) void kickFromRoom(liveKitConfig, state.channelId, socket.id)
  if (emit) emitVoice(io)
}

/** A conta está silenciada por um moderador? */
export function isServerMuted(accountId: string): boolean {
  return serverMuted.has(accountId)
}

/** Tira a conexão `socketId` da sala (moderação). Devolve o estado que ela tinha, ou undefined se não estava em sala. */
export function kickFromVoice(io: AppServer, socketId: string): VoiceState | undefined {
  const socket = io.sockets.sockets.get(socketId)
  const state = voice.get(socketId)
  if (!socket || !state) return undefined
  leaveVoice(io, socket)
  return state
}

/**
 * Silencia (ou tira o silêncio) da conta para todos. Vale para todas as conexões dela
 * nas salas e para as próximas entradas; no LiveKit o microfone deixa de ser aceito.
 */
export function setServerMuted(io: AppServer, accountId: string, muted: boolean): void {
  if (muted) serverMuted.add(accountId)
  else serverMuted.delete(accountId)
  applyVoiceAccess(io, accessSnapshot())
}

/** Tira todo mundo de uma sala (usado quando o canal é apagado). Não emite `voice:state`. */
export function clearVoiceChannel(_io: AppServer, channelId: string): void {
  for (const [sid, state] of voice) {
    if (state.channelId !== channelId) continue
    voice.delete(sid)
    published.delete(sid)
  }
  // Sempre encerra: pode haver alguém no LiveKit que a lista não conhece (o 404 é ignorado).
  if (liveKitConfig) void closeRoom(liveKitConfig, channelId)
}

export const voiceModule: ServerModule = {
  socket(io, socket) {
    socket.on('voice:join', (payload, ack) => {
      if (typeof ack !== 'function') return
      void guard('voice:join', async () => {
        const user = socket.data.user
        if (!user) return ack({ ok: false, error: 'Não autenticado' })
        if (!liveKitConfig) return ack({ ok: false, error: 'A voz não está configurada neste servidor' })
        const channel = typeof payload?.channelId === 'string' ? await findChannel(payload.channelId, 'voice') : undefined
        // Sem permissão de ver, responde como se o canal não existisse (não revela salas privadas).
        if (!channel || !(await allowed(user.accountId, 'view', channel.id))) {
          return ack({ ok: false, error: 'Canal de voz não encontrado' })
        }
        if (!(await allowed(user.accountId, 'connect', channel.id))) {
          return ack({ ok: false, error: 'Você não tem permissão para entrar nesta sala' })
        }
        // Sem `speak`, entra só para ouvir (e os outros veem silenciado); sem `share`, sem tela.
        const permissions = voicePermissions(await currentAccess(), user.accountId, channel.id)
        const credentials = await createVoiceCredentials(liveKitConfig, user, channel.id, permissions)
        if (!socket.connected) return
        // Trocar de sala: sai da anterior (inclusive no LiveKit) antes de entrar na nova.
        if (voice.get(socket.id)?.channelId !== channel.id) leaveVoice(io, socket)
        voice.set(socket.id, {
          userId: socket.id,
          channelId: channel.id,
          muted: !!payload.muted || !permissions.canSpeak,
          serverMuted: serverMuted.has(user.accountId),
          deafened: !!payload.deafened,
          // Entrar (ou trocar de sala) começa sem tela; o app avisa com voice:sharing ao publicar.
          sharing: false
        })
        published.set(socket.id, permissions)
        ack({ ok: true, ...credentials, ...permissions })
        emitVoice(io)
      })
    })

    socket.on('voice:leave', () => leaveVoice(io, socket))

    socket.on('voice:update', (payload) => {
      const state = voice.get(socket.id)
      if (!state) return
      // quem não pode falar continua aparecendo silenciado
      state.muted = !!payload?.muted || published.get(socket.id)?.canSpeak === false
      state.deafened = !!payload?.deafened
      emitVoice(io)
    })

    socket.on('voice:sharing', (sharing) => {
      const state = voice.get(socket.id)
      if (!state || typeof sharing !== 'boolean' || state.sharing === sharing) return
      // sem `share` não aparece "ao vivo" (o LiveKit também não aceita a tela)
      if (sharing && published.get(socket.id)?.canShare === false) return
      state.sharing = sharing
      emitVoice(io)
    })

    socket.on('disconnect', () => leaveVoice(io, socket))
  }
}
