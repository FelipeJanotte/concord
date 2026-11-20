import { describe, expect, it } from 'vitest'
import { latestYml } from './latest-yml.mjs'

const release = {
  version: '0.1.27',
  fileName: 'Concord-0.1.27-setup.exe',
  sha512: 'q83vEjRWeJC3zX9a8Q==',
  size: 4194304,
  releaseDate: '2026-11-19T12:00:00.000Z'
}

describe('latestYml', () => {
  it('writes the electron-updater format', () => {
    expect(latestYml(release)).toBe(
      [
        'version: 0.1.27',
        'files:',
        '  - url: Concord-0.1.27-setup.exe',
        '    sha512: q83vEjRWeJC3zX9a8Q==',
        '    size: 4194304',
        'path: Concord-0.1.27-setup.exe',
        'sha512: q83vEjRWeJC3zX9a8Q==',
        "releaseDate: '2026-11-19T12:00:00.000Z'",
        ''
      ].join('\n')
    )
  })

  it('follows the file name it is given', () => {
    const text = latestYml({ ...release, fileName: 'Concord-9.9.9-setup.exe' })
    expect(text.match(/Concord-9\.9\.9-setup\.exe/g)).toHaveLength(2)
    expect(text).not.toContain('0.1.27-setup')
  })

  it('rejects a file name that is not a single hyphenated asset name', () => {
    expect(() => latestYml({ ...release, fileName: 'Concord 0.1.27 setup.exe' })).toThrow()
    expect(() => latestYml({ ...release, fileName: 'dir/Concord-0.1.27-setup.exe' })).toThrow()
  })

  it('rejects a size that is not a positive integer', () => {
    expect(() => latestYml({ ...release, size: 0 })).toThrow()
    expect(() => latestYml({ ...release, size: 1.5 })).toThrow()
  })
})
