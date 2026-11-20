import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { nextVersion, parseVersion, prVersion } from '../.github/scripts/next-version.mjs'

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

describe('prVersion', () => {
  it('sobe o patch da maior entre a última tag e a versão da main', () => {
    expect(prVersion({ tags: ['v0.1.2'], mainVersion: '0.1.0' })).toBe('0.1.3')
    expect(prVersion({ tags: ['v0.1.2'], mainVersion: '0.1.5' })).toBe('0.1.6')
    expect(prVersion({ tags: [], mainVersion: '0.1.0' })).toBe('0.1.1')
  })

  it('labels: minor e major mudam o salto; "sem release" volta para a versão base', () => {
    expect(prVersion({ tags: ['v1.4.2'], mainVersion: '1.4.2', labels: ['release: minor'] })).toBe('1.5.0')
    expect(prVersion({ tags: ['v1.4.2'], mainVersion: '1.4.2', labels: ['Release: Major'] })).toBe('2.0.0')
    expect(prVersion({ tags: ['v1.4.2'], mainVersion: '1.4.0', labels: ['sem release'] })).toBe('1.4.2')
  })

  it('é sempre a mesma resposta para a mesma entrada (rodar de novo no PR não muda nada)', () => {
    const input = { tags: ['v0.3.0', 'v0.2.9'], mainVersion: '0.3.0', labels: ['bug'] }
    expect(prVersion(input)).toBe(prVersion(input))
    expect(prVersion(input)).toBe('0.3.1')
  })

  it('versão da main inválida dá erro claro', () => {
    expect(() => prVersion({ tags: [], mainVersion: 'x' })).toThrow('versão inválida')
  })
})

describe('nextVersion depois que o PR já subiu o package.json', () => {
  it('no merge publica a versão do package.json (o normal: o PR já subiu)', () => {
    expect(nextVersion({ tags: ['v0.1.2'], packageVersion: '0.1.3', labels: ['release: minor'] })).toBe('0.1.3')
  })

  it('dois PRs com a mesma versão: o segundo não repete a tag, sobe o patch', () => {
    expect(nextVersion({ tags: ['v0.1.2', 'v0.1.3'], packageVersion: '0.1.3' })).toBe('0.1.4')
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

  it('versão no PR: em cada mudança do PR para a main, só do próprio repositório, com o RELEASE_TOKEN e um commit por vez', () => {
    const pr = read('.github/workflows/pr-version.yml')
    expect(pr).toMatch(/pull_request:\n {4}branches: \[main\]/)
    expect(pr).toContain('types: [opened, reopened, synchronize, labeled, unlabeled]')
    expect(pr).toContain('github.event.pull_request.head.repo.full_name == github.repository')
    expect(pr).toContain('secrets.RELEASE_TOKEN || secrets.GITHUB_TOKEN')
    expect(pr).toContain('node .github/scripts/next-version.mjs pr')
    expect(pr).toContain('npm version')
    expect(pr).toContain('cancel-in-progress: true')
  })

  it('release.yml cria a release antes de enviar os arquivos (uma release só, com todos os arquivos)', () => {
    expect(release.indexOf('gh release create')).toBeGreaterThan(-1)
    expect(release.indexOf('gh release create')).toBeLessThan(release.indexOf('gh release upload'))
    expect(release).not.toContain('gh release edit')
  })

  it('release.yml: pode ser chamado (workflow_call) e por tag; a versão vem da tag', () => {
    expect(release).toContain('workflow_call:')
    expect(release).toMatch(/tags: \['v\*\.\*\.\*'\]/)
    expect(release).toContain('npm version')
    expect(release).toContain('VITE_DEFAULT_SERVER: ${{ vars.VITE_DEFAULT_SERVER }}')
  })
})
