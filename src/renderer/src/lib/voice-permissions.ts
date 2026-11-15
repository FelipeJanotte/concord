/**
 * O que o LiveKit deixa esta conexão publicar, a partir das permissões que ele manda
 * (`localParticipant.permissions`). Mesma regra do `hasPermissionsToPublish` do `livekit-client`:
 * precisa de `canPublish` e a fonte na lista (lista vazia = qualquer fonte).
 */
import type { VoicePermissions } from '@shared/types'

/** Valores do enum `livekit.TrackSource` do protocolo (o `livekit-client` não exporta o conversor). */
export const PROTO_SOURCE = { CAMERA: 1, MICROPHONE: 2, SCREEN_SHARE: 3 } as const

interface LiveKitPermission {
  canPublish?: boolean
  canPublishSources?: readonly number[]
}

export function permissionsFrom(perm: LiveKitPermission | undefined): VoicePermissions {
  if (!perm?.canPublish) return { canSpeak: false, canShare: false, canVideo: false }
  const sources = perm.canPublishSources ?? []
  const allows = (source: number): boolean => sources.length === 0 || sources.includes(source)
  return { canSpeak: allows(PROTO_SOURCE.MICROPHONE), canShare: allows(PROTO_SOURCE.SCREEN_SHARE), canVideo: allows(PROTO_SOURCE.CAMERA) }
}
