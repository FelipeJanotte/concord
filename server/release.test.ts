import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { nextVersion, parseVersion } from '../.github/scripts/next-version.mjs'

const root = join(__dirname, '..')
const read = (file: string): string => readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n')

describe('nextVersion', () => {
  it('sem tag: sobe o patch do package.json', () => {
    expect(nextVersion({ tags: [], packageVersion: '0.1.0' })).toBe('0.1.1')
  })

  it('com tags: sobe o patch da maior (ordem de versão, não de texto)', () => {
    expect(nextVersion({ tags: ['v0.1.9', 'v0.1.10', 'v0.1.2'], packageVersion: '0.1.0' })).toBe('0.1.11')
  })

  it('labels do PR: minor, major e "sem release"', () => {
    const tags = ['v1.4.2']
    expect(nextVersion({ tags, packageVersion: '0.1.0', labels: ['release: minor'] })).toBe('1.5.0')
    expect(nextVersion({ tags, packageVersion: '0.1.0', labels: ['bug', 'Release: Major'] })).toBe('2.0.0')
    expect(nextVersion({ tags, packageVersion: '0.1.0', labels: ['sem release'] })).toBeNull()
  })

  it('package.json acima da última tag (subiu à mão): publica exatamente ela', () => {
    expect(nextVersion({ tags: ['v0.3.4'], packageVersion: '1.0.0' })).toBe('1.0.0')
  })

  it('ignora tags que não são vX.Y.Z', () => {
    expect(nextVersion({ tags: ['latest', 'v1.2', 'v0.2.0-beta', 'v0.2.0'], packageVersion: '0.1.0' })).toBe('0.2.1')
  })

  it('package.json com versão inválida dá erro claro', () => {
    expect(() => nextVersion({ tags: [], packageVersion: 'abc' })).toThrow('versão inválida')
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
  })
})

describe('workflows de release', () => {
  const auto = read('.github/workflows/auto-release.yml')
  const release = read('.github/workflows/release.yml')

  it('auto-release: em todo push na main, uma release por vez, chama o release.yml com a tag criada', () => {
    expect(auto).toMatch(/on:\n {2}push:\n {4}branches: \[main\]/)
    expect(auto).toContain('concurrency:')
    expect(auto).toContain('node .github/scripts/next-version.mjs')
    expect(auto).toContain('uses: ./.github/workflows/release.yml')
    expect(auto).toMatch(/contents: write/)
  })

  it('release.yml: pode ser chamado (workflow_call) e por tag; a versão vem da tag', () => {
    expect(release).toContain('workflow_call:')
    expect(release).toMatch(/tags: \['v\*\.\*\.\*'\]/)
    expect(release).toContain('npm version')
    expect(release).toContain('VITE_DEFAULT_SERVER: ${{ vars.VITE_DEFAULT_SERVER }}')
  })
})
