import { TokenVerifier } from 'livekit-server-sdk'
import { describe, expect, it, vi } from 'vitest'
import type { User } from '../src/shared/types'
import { createVoiceCredentials, readLiveKitConfig } from './livekit'

const base = { LIVEKIT_URL: 'ws://localhost:7880', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 'segredo-com-mais-de-32-caracteres-aqui' }

describe('readLiveKitConfig', () => {
  it('lê a configuração e deriva o endereço da API a partir do LIVEKIT_URL', () => {
    expect(readLiveKitConfig(base)).toEqual({
      url: 'ws://localhost:7880',
      apiUrl: 'http://localhost:7880',
      apiKey: 'k',
      apiSecret: base.LIVEKIT_API_SECRET
    })
    expect(readLiveKitConfig({ ...base, LIVEKIT_URL: ' wss://voz.exemplo.test/ ' })).toMatchObject({
      url: 'wss://voz.exemplo.test',
      apiUrl: 'https://voz.exemplo.test'
    })
  })

  it('LIVEKIT_API_URL sobrescreve o endereço da API (ex.: rede interna do Docker)', () => {
    expect(readLiveKitConfig({ ...base, LIVEKIT_API_URL: 'http://livekit:7880/' })?.apiUrl).toBe('http://livekit:7880')
  })

  it.each(['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'])('sem %s a voz fica desativada', (key) => {
    expect(readLiveKitConfig({ ...base, [key]: '  ' })).toBeNull()
    expect(readLiveKitConfig({ ...base, [key]: undefined })).toBeNull()
  })

  it('recusa LIVEKIT_URL que não é ws:// ou wss://', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readLiveKitConfig({ ...base, LIVEKIT_URL: 'http://localhost:7880' })).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})

describe('createVoiceCredentials', () => {
  const config = readLiveKitConfig(base)!
  const user: User = { id: 'socket-1', accountId: 'conta-1', name: 'Ana', tag: 'ana1', color: '#000', avatarUrl: null }
  const all = { canSpeak: true, canShare: true, canVideo: true }

  it('emite token assinado para a sala do canal com identidade = User.id', async () => {
    const { url, token } = await createVoiceCredentials(config, user, 'canal-1', all)
    expect(url).toBe('ws://localhost:7880')
    const claims = await new TokenVerifier('k', base.LIVEKIT_API_SECRET).verify(token)
    expect(claims).toMatchObject({ sub: 'socket-1', name: 'Ana#ana1', attributes: { accountId: 'conta-1' } })
    expect(claims.video).toMatchObject({ room: 'canal-1', roomJoin: true, canPublishData: false })
    expect(claims.video?.canPublishSources).toContain('camera')
  })

  it('câmera só com a permissão `video` (B21)', async () => {
    const { token } = await createVoiceCredentials(config, user, 'canal-1', { ...all, canVideo: false })
    const claims = await new TokenVerifier('k', base.LIVEKIT_API_SECRET).verify(token)
    expect(claims.video?.canPublishSources).toEqual(expect.arrayContaining(['microphone', 'screen_share']))
    expect(claims.video?.canPublishSources).not.toContain('camera')
  })

  it('token assinado com outro segredo não passa', async () => {
    const { token } = await createVoiceCredentials(config, user, 'canal-1', all)
    await expect(new TokenVerifier('k', 'outro-segredo-com-mais-de-32-caracteres!!').verify(token)).rejects.toThrow()
  })
})
