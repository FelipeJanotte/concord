import { describe, expect, it } from 'vitest'
import { formatBytes } from './format'

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1024, '1 KB'],
    [1536, '1,5 KB'],
    [10 * 1024, '10 KB'],
    [25 * 1024 * 1024, '25 MB'],
    [1.25 * 1024 ** 3, '1,3 GB']
  ])('%d bytes → %s', (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text)
  })

  it('valor inválido vira traço', () => {
    expect(formatBytes(-1)).toBe('—')
    expect(formatBytes(Number.NaN)).toBe('—')
  })
})
