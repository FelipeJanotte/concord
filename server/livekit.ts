import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'
import type { User, VoiceCredentials, VoicePermissions } from '../src/shared/types'

export interface LiveKitConfig {
  url: string
  apiUrl: string
  apiKey: string
  apiSecret: string
}

const TOKEN_TTL = '60s'

const SCREEN_SOURCES = [TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]

export function publishSources({ canSpeak, canShare, canVideo }: VoicePermissions): TrackSource[] {
  return [
    ...(canSpeak ? [TrackSource.MICROPHONE] : []),
    ...(canShare ? SCREEN_SOURCES : []),
    ...(canVideo ? [TrackSource.CAMERA] : [])
  ]
}

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

export async function createVoiceCredentials(
  config: LiveKitConfig,
  user: User,
  channelId: string,
  permissions: VoicePermissions
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
    roomCreate: false,
    roomList: false,
    roomAdmin: false,
    canSubscribe: true,
    canPublish: sources.length > 0,
    canPublishSources: sources,
    canPublishData: false,
    canUpdateOwnMetadata: false
  })
  return { url: config.url, token: await at.toJwt() }
}

export function screenIdentityOf(accountId: string): string {
  return `${accountId}:screen`
}

export async function createScreenCredentials(config: LiveKitConfig, user: User, channelId: string): Promise<VoiceCredentials> {
  const at = new AccessToken(config.apiKey, config.apiSecret, {
    identity: screenIdentityOf(user.accountId),
    name: user.name,
    ttl: TOKEN_TTL,
    metadata: JSON.stringify({ screenOf: user.accountId })
  })
  at.addGrant({
    room: channelId,
    roomJoin: true,
    roomCreate: false,
    roomList: false,
    roomAdmin: false,
    canSubscribe: false,
    canPublish: true,
    canPublishSources: SCREEN_SOURCES,
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

function isNotFound(err: unknown): boolean {
  const e = err as { status?: number; code?: string } | null
  return e?.status === 404 || e?.code === 'not_found'
}

function logFailure(action: string, err: unknown): void {
  if (isNotFound(err)) return
  console.warn(`[livekit] ${action} falhou:`, err instanceof Error ? err.message : err)
}

export async function kickFromRoom(config: LiveKitConfig, channelId: string, identity: string): Promise<void> {
  try {
    await rooms(config).removeParticipant(channelId, identity)
  } catch (err) {
    logFailure(`remover ${identity} da sala ${channelId}`, err)
  }
}

export async function updateVoicePermissions(
  config: LiveKitConfig,
  channelId: string,
  identity: string,
  permissions: VoicePermissions
): Promise<void> {
  const sources = publishSources(permissions)
  try {
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

export async function closeRoom(config: LiveKitConfig, channelId: string): Promise<void> {
  try {
    await rooms(config).deleteRoom(channelId)
  } catch (err) {
    logFailure(`encerrar a sala ${channelId}`, err)
  }
}
