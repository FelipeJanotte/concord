import { describe, expect, it } from 'vitest'
import { DEFAULT_SCREEN_QUALITY, SCREEN_FPS, SCREEN_RESOLUTIONS, parseScreenQuality, screenCapture } from './screen'

describe('screenCapture', () => {
  it('o padrão continua 1080p a 15 fps com foco em detalhe', () => {
    expect(screenCapture(DEFAULT_SCREEN_QUALITY)).toEqual({
      resolution: { width: 1920, height: 1080, frameRate: 15 },
      contentHint: 'detail',
      maxBitrate: 2_500_000
    })
  })

  it('acima de 15 fps prioriza movimento', () => {
    expect(screenCapture({ resolution: '720p', fps: 30 }).contentHint).toBe('motion')
    expect(screenCapture({ resolution: '720p', fps: 60 }).contentHint).toBe('motion')
    expect(screenCapture({ resolution: '1440p', fps: 15 }).contentHint).toBe('detail')
  })

  it('cada resolução tem o seu tamanho e original vai até 4K', () => {
    expect(screenCapture({ resolution: '720p', fps: 15 }).resolution).toMatchObject({ width: 1280, height: 720 })
    expect(screenCapture({ resolution: '1440p', fps: 15 }).resolution).toMatchObject({ width: 2560, height: 1440 })
    expect(screenCapture({ resolution: 'original', fps: 15 }).resolution).toMatchObject({ width: 3840, height: 2160 })
  })

  it('o bitrate cresce com a resolução e com o fps', () => {
    for (const fps of SCREEN_FPS) {
      const rates = SCREEN_RESOLUTIONS.map((resolution) => screenCapture({ resolution, fps }).maxBitrate)
      expect(rates).toEqual([...rates].sort((a, b) => a - b))
    }
    for (const resolution of SCREEN_RESOLUTIONS) {
      const rates = SCREEN_FPS.map((fps) => screenCapture({ resolution, fps }).maxBitrate)
      expect(new Set(rates).size).toBe(rates.length)
      expect(rates).toEqual([...rates].sort((a, b) => a - b))
    }
  })
})

describe('parseScreenQuality', () => {
  it('aceita uma qualidade válida', () => {
    expect(parseScreenQuality({ resolution: '1440p', fps: 60 })).toEqual({ resolution: '1440p', fps: 60 })
  })

  it.each([null, 'x', {}, { resolution: '4k', fps: 30 }, { resolution: '720p', fps: 24 }])('valor inválido %j vira o padrão', (value) => {
    expect(parseScreenQuality(value)).toEqual(DEFAULT_SCREEN_QUALITY)
  })
})
