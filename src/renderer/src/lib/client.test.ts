import { describe, expect, it } from 'vitest'
import { resolveAvatarUrl } from './client'

describe('resolveAvatarUrl', () => {
  it('sem foto devolve undefined', () => {
    expect(resolveAvatarUrl(null, 'http://localhost:3001')).toBeUndefined()
    expect(resolveAvatarUrl(undefined, 'http://localhost:3001')).toBeUndefined()
    expect(resolveAvatarUrl('', 'http://localhost:3001')).toBeUndefined()
  })

  it('prefixa caminhos relativos com o servidor, sem barra dupla', () => {
    expect(resolveAvatarUrl('/avatars/abc?v=2', 'http://192.168.0.10:3001/')).toBe(
      'http://192.168.0.10:3001/avatars/abc?v=2'
    )
    expect(resolveAvatarUrl('/avatars/abc', '  http://localhost:3001//  ')).toBe('http://localhost:3001/avatars/abc')
  })

  it('mantém URLs absolutas, data: e blob:', () => {
    for (const url of ['https://cdn.exemplo.test/a.png', 'http://x.test/a.png', 'data:image/png;base64,AA==', 'blob:abc']) {
      expect(resolveAvatarUrl(url, 'http://localhost:3001')).toBe(url)
    }
  })

  it('caminho relativo sem servidor devolve undefined', () => {
    expect(resolveAvatarUrl('/avatars/abc', null)).toBeUndefined()
  })
})
