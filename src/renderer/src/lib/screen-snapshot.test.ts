import { describe, expect, it } from 'vitest'
import { SCREEN_PREVIEW_WIDTH } from '@shared/types'
import { previewSize } from './screen-snapshot'

describe('previewSize', () => {
  it('reduz a tela para a largura da prévia mantendo a proporção', () => {
    expect(previewSize(1920, 1080)).toEqual({ width: SCREEN_PREVIEW_WIDTH, height: Math.round((1080 * SCREEN_PREVIEW_WIDTH) / 1920) })
    expect(previewSize(2560, 1440, 320)).toEqual({ width: 320, height: 180 })
  })

  it('tela menor que a prévia fica do tamanho original', () => {
    expect(previewSize(300, 200, 480)).toEqual({ width: 300, height: 200 })
  })
})
