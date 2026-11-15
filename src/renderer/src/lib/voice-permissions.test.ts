import { describe, expect, it } from 'vitest'
import { permissionsFrom, PROTO_SOURCE } from './voice-permissions'

describe('permissionsFrom', () => {
  const { CAMERA, MICROPHONE, SCREEN_SHARE } = PROTO_SOURCE

  it('microfone e tela conforme a lista de fontes', () => {
    expect(permissionsFrom({ canPublish: true, canPublishSources: [MICROPHONE, SCREEN_SHARE, 4] })).toEqual({
      canSpeak: true,
      canShare: true,
      canVideo: false
    })
    expect(permissionsFrom({ canPublish: true, canPublishSources: [MICROPHONE] })).toEqual({ canSpeak: true, canShare: false, canVideo: false })
    expect(permissionsFrom({ canPublish: true, canPublishSources: [SCREEN_SHARE, 4] })).toEqual({ canSpeak: false, canShare: true, canVideo: false })
  })

  it('sem canPublish não publica nada, nem com a lista cheia', () => {
    expect(permissionsFrom({ canPublish: false, canPublishSources: [MICROPHONE, SCREEN_SHARE] })).toEqual({
      canSpeak: false,
      canShare: false,
      canVideo: false
    })
    expect(permissionsFrom(undefined)).toEqual({ canSpeak: false, canShare: false, canVideo: false })
  })

  it('câmera (B21) só com a fonte CAMERA na lista', () => {
    expect(permissionsFrom({ canPublish: true, canPublishSources: [CAMERA] })).toEqual({ canSpeak: false, canShare: false, canVideo: true })
  })

  it('lista vazia com canPublish = qualquer fonte (regra do livekit-client)', () => {
    expect(permissionsFrom({ canPublish: true, canPublishSources: [] })).toEqual({ canSpeak: true, canShare: true, canVideo: true })
    expect(permissionsFrom({ canPublish: true })).toEqual({ canSpeak: true, canShare: true, canVideo: true })
  })
})
