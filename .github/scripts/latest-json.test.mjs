import { describe, expect, it } from 'vitest'
import { latestJson } from './latest-json.mjs'

const release = {
  version: '0.1.27',
  fileName: 'concord-0.1.27-setup.exe',
  signature: 'dW50cnVzdGVk==',
  repository: 'FelipeJanotte/concord',
  notes: 'feat: algo (#1)',
  publishedAt: '2026-11-19T12:00:00.000Z'
}

describe('latestJson', () => {
  it('writes the Tauri updater manifest pointing at the release asset', () => {
    expect(JSON.parse(latestJson(release))).toEqual({
      version: '0.1.27',
      notes: 'feat: algo (#1)',
      pub_date: '2026-11-19T12:00:00.000Z',
      platforms: {
        'windows-x86_64': {
          signature: 'dW50cnVzdGVk==',
          url: 'https://github.com/FelipeJanotte/concord/releases/download/v0.1.27/concord-0.1.27-setup.exe'
        }
      }
    })
  })

  it('trims the line break the signature file ends with', () => {
    const manifest = JSON.parse(latestJson({ ...release, signature: 'abc==\n' }))
    expect(manifest.platforms['windows-x86_64'].signature).toBe('abc==')
  })

  it('rejects a file name that is not a single asset name', () => {
    expect(() => latestJson({ ...release, fileName: 'a b.exe' })).toThrow()
  })
})
