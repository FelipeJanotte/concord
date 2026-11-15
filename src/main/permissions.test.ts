import { describe, expect, it } from 'vitest'
import { allowPermission } from './permissions'

describe('allowPermission', () => {
  it('libera microfone/câmera, notificações e tela cheia', () => {
    expect(allowPermission('media')).toBe(true)
    expect(allowPermission('notifications')).toBe(true)
    expect(allowPermission('fullscreen')).toBe(true)
  })

  it('nega o resto', () => {
    for (const p of ['geolocation', 'midi', 'pointerLock', 'openExternal', 'clipboard-read', '']) expect(allowPermission(p)).toBe(false)
  })
})
