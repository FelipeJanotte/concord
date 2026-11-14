/**
 * Integração com o LiveKit (SFU de voz e tela). Skill `concord-voice`.
 *
 * O servidor do Concord nunca toca no áudio: ele emite um JWT que deixa a conexão
 * entrar numa única sala (sala = id do canal, identidade = socket.id) e, quando a
 * pessoa sai pelo Concord, tira ela da sala no LiveKit também.
 *
 * Variáveis (server/.env): LIVEKIT_URL (endereço que o APP usa), LIVEKIT_API_KEY,
 * LIVEKIT_API_SECRET e, opcional, LIVEKIT_API_URL (endereço que o SERVIDOR usa para
 * a API do LiveKit; padrão: LIVEKIT_URL trocando ws→http).
 */
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'
import type { User, VoiceCredentials, VoicePermissions } from '../src/shared/types'

export interface LiveKitConfig {
  url: string
  apiUrl: string
  apiKey: string
  apiSecret: string
}

/**
 * O token só serve para conectar; depois o LiveKit renova a sessão sozinho. Curto de
 * propósito: quem foi tirado da sala não consegue voltar com um token guardado.
 */
const TOKEN_TTL = '60s'

/** O que a pessoa pode publicar na sala (v2): microfone com `speak`, tela com `share`. */
export function publishSources({ canSpeak, canShare }: VoicePermissions): TrackSource[] {
  return [
    ...(canSpeak ? [TrackSource.MICROPHONE] : []),
    ...(canShare ? [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] : [])
  ]
}

/** Lê a configuração do ambiente. Devolve null se faltar algo (voz desativada). */
export function readLiveKitConfig(env: NodeJS.ProcessEnv = process.env): LiveKitConfig | null {
  const url = env.LIVEKIT_URL?.trim() ?? ''
  const apiKey = env.LIVEKIT_API_KEY?.trim() ?? ''
  const apiSecret = env.LIVEKIT_API_SECRET?.trim() ?? ''
  if (!url || !apiKey || !apiSecret) return null
  if (!/^wss?:\/\//.test(url)) {
    console.warn(`[livekit] LIVEKIT_URL deve começar com ws:// ou wss:// (veio "${url}"); voz desativada`)
    return null
  }
  const apiUrl = env.LIVEKIT_API_URL?.trim() || url.replace(/^ws/, 'http')
  return { url: url.replace(/\/+$/, ''), apiUrl: apiUrl.replace(/\/+$/, ''), apiKey, apiSecret }
}

export const liveKitConfig = readLiveKitConfig()

/** Gera as credenciais para `user` entrar na sala do canal `channelId`, com o que ele pode publicar. */
export async function createVoiceCredentials(
  config: LiveKitConfig,
  user: User,
  channelId: string,
  permissions: VoicePermissions = { canSpeak: true, canShare: true }
): Promise<VoiceCredentials> {
  const sources = publishSources(permissions)
  const at = new AccessToken(config.apiKey, config.apiSecret, {
    identity: user.id,
    name: user.tag ? `${user.name}#${user.tag}` : user.name,
    ttl: TOKEN_TTL,
    attributes: { accountId: user.accountId }
  })
  at.addGrant({
    room: channelId,
    roomJoin: true,
    // A sala é criada pelo próprio join; ninguém lista nem administra salas pelo app.
    roomCreate: false,
    roomList: false,
    roomAdmin: false,
    canSubscribe: true,
    // Microfone se pode falar, tela se pode compartilhar (v2). Câmera fica de fora até existir na interface.
    canPublish: sources.length > 0,
    canPublishSources: sources,
    canPublishData: false,
    canUpdateOwnMetadata: false
  })
  return { url: config.url, token: await at.toJwt() }
}

let roomService: RoomServiceClient | null = null
function rooms(config: LiveKitConfig): RoomServiceClient {
  roomService ??= new RoomServiceClient(config.apiUrl, config.apiKey, config.apiSecret)
  return roomService
}

/** "Não existe" (sala vazia ou pessoa que nem chegou a conectar) não é erro. */
function isNotFound(err: unknown): boolean {
  const e = err as { status?: number; code?: string } | null
  return e?.status === 404 || e?.code === 'not_found'
}

function logFailure(action: string, err: unknown): void {
  if (isNotFound(err)) return
  console.warn(`[livekit] ${action} falhou:`, err instanceof Error ? err.message : err)
}

/**
 * Tira uma conexão da sala no LiveKit (saiu da voz, trocou de sala ou caiu).
 * Sem isso, um cliente modificado continuaria ouvindo depois de "sair".
 */
export async function kickFromRoom(config: LiveKitConfig, channelId: string, identity: string): Promise<void> {
  try {
    await rooms(config).removeParticipant(channelId, identity)
  } catch (err) {
    logFailure(`remover ${identity} da sala ${channelId}`, err)
  }
}

/**
 * Muda ao vivo o que uma conexão pode publicar (cargo/regra mudou com ela na sala).
 * Perder `speak` corta o microfone na hora; perder `share` corta a tela.
 */
export async function updateVoicePermissions(
  config: LiveKitConfig,
  channelId: string,
  identity: string,
  permissions: VoicePermissions
): Promise<void> {
  const sources = publishSources(permissions)
  try {
    // o LiveKit troca as permissões inteiras de uma vez: manda o conjunto completo
    await rooms(config).updateParticipant(channelId, identity, {
      permission: {
        canSubscribe: true,
        canPublish: sources.length > 0,
        canPublishSources: sources,
        canPublishData: false,
        canUpdateMetadata: false
      }
    })
  } catch (err) {
    logFailure(`atualizar as permissões de ${identity} na sala ${channelId}`, err)
  }
}

/** Encerra a sala inteira (canal apagado). */
export async function closeRoom(config: LiveKitConfig, channelId: string): Promise<void> {
  try {
    await rooms(config).deleteRoom(channelId)
  } catch (err) {
    logFailure(`encerrar a sala ${channelId}`, err)
  }
}
