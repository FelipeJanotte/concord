import { describe, expect, it, vi } from 'vitest'
import type { MigrationFs } from './migration'

vi.mock('electron', () => ({ app: {} }))

const { exportMigrationFile, pickConcordEntries } = await import('./migration')

function memoryFs(): MigrationFs & { files: Map<string, string>; calls: string[] } {
  const files = new Map<string, string>()
  const calls: string[] = []
  return {
    files,
    calls,
    writeFile: async (path, data) => {
      calls.push(`write ${path}`)
      files.set(path, data)
    },
    rename: async (from, to) => {
      calls.push(`rename ${from} ${to}`)
      files.set(to, files.get(from) ?? '')
      files.delete(from)
    }
  }
}

describe('pickConcordEntries', () => {
  it('mantém só as chaves concord: com o valor cru', () => {
    expect(pickConcordEntries({ 'concord:audio': '{"mic":1}', 'concord:theme': 'dark', other: 'x', 'xconcord:a': 'y' })).toEqual({
      'concord:audio': '{"mic":1}',
      'concord:theme': 'dark'
    })
  })

  it('valor que não é texto ou página sem objeto: nada', () => {
    expect(pickConcordEntries({ 'concord:a': 1 as never })).toEqual({})
    expect(pickConcordEntries(null)).toEqual({})
  })
})

describe('exportMigrationFile', () => {
  it('grava migrate.json no formato versionado, pelo arquivo temporário e renomeando', async () => {
    const fs = memoryFs()
    await exportMigrationFile({ fs, userDataDir: '/data', pairs: { 'concord:a': '1', b: '2' }, now: new Date('2026-01-02T03:04:05.000Z'), log: vi.fn() })
    expect([...fs.files.keys()]).toEqual(['/data/migrate.json'])
    expect(JSON.parse(fs.files.get('/data/migrate.json') ?? '')).toEqual({
      version: 1,
      exportedAt: '2026-01-02T03:04:05.000Z',
      entries: { 'concord:a': '1' }
    })
    expect(fs.calls).toEqual(['write /data/migrate.json.tmp', 'rename /data/migrate.json.tmp /data/migrate.json'])
  })

  it('falha ao gravar: loga e não lança', async () => {
    const fs = memoryFs()
    fs.writeFile = async () => {
      throw new Error('disco cheio')
    }
    const log = vi.fn()
    await expect(exportMigrationFile({ fs, userDataDir: '/data', pairs: {}, now: new Date(), log })).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith('[migração] não exportou as preferências:', expect.objectContaining({ message: 'disco cheio' }))
  })
})
