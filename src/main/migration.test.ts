import { describe, expect, it, vi } from 'vitest'
import type { MigrationFs, MigrationWindow } from './migration'

vi.mock('electron', () => ({ app: {} }))

const { exportMigrationFile, pickConcordEntries, watchMigration } = await import('./migration')

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

describe('exportMigrationFile com rename que falha', () => {
  it('loga o erro e deixa o migrate.json anterior intacto', async () => {
    const fs = memoryFs()
    fs.files.set('/data/migrate.json', 'anterior')
    fs.rename = async () => {
      throw new Error('arquivo em uso')
    }
    const log = vi.fn()
    await exportMigrationFile({ fs, userDataDir: '/data', pairs: { 'concord:a': '1' }, now: new Date(), log })
    expect(fs.files.get('/data/migrate.json')).toBe('anterior')
    expect(log).toHaveBeenCalledWith('[migração] não exportou as preferências:', expect.objectContaining({ message: 'arquivo em uso' }))
  })
})

function fakeWindow(readLocalStorage: () => Promise<unknown>) {
  let finishLoad = (): void => undefined
  let closeHandler: (event: { preventDefault: () => void }) => void = () => undefined
  const closes: number[] = []
  let prevented = 0
  const window: MigrationWindow = {
    onFinishLoad: (fn) => {
      finishLoad = fn
    },
    onClose: (fn) => {
      closeHandler = fn
    },
    readLocalStorage,
    close: () => {
      closes.push(1)
      closeHandler({ preventDefault: () => (prevented += 1) })
    }
  }
  return {
    window,
    load: () => finishLoad(),
    userClose: () => closeHandler({ preventDefault: () => (prevented += 1) }),
    closes,
    prevented: () => prevented
  }
}

function watched(readLocalStorage: () => Promise<unknown>) {
  const fs = memoryFs()
  const log = vi.fn()
  const win = fakeWindow(readLocalStorage)
  watchMigration({ window: win.window, fs, userDataDir: '/data', now: () => new Date('2026-01-02T03:04:05.000Z'), log })
  const entries = (): unknown => JSON.parse(fs.files.get('/data/migrate.json') ?? 'null')?.entries
  return { fs, log, win, entries }
}

describe('watchMigration', () => {
  it('ao carregar a página grava as chaves concord: do localStorage', async () => {
    const { win, entries, fs } = watched(async () => ({ 'concord:a': '1', other: '2' }))
    win.load()
    await vi.waitFor(() => expect(fs.files.has('/data/migrate.json')).toBe(true))
    expect(entries()).toEqual({ 'concord:a': '1' })
    expect(win.closes).toEqual([])
  })

  it('ao fechar exporta o que há agora, uma vez só, e fecha de verdade', async () => {
    let current: Record<string, string> = { 'concord:a': '1' }
    const { win, entries, fs } = watched(async () => current)
    win.load()
    await vi.waitFor(() => expect(entries()).toEqual({ 'concord:a': '1' }))
    current = { 'concord:a': '2' }
    win.userClose()
    expect(win.prevented()).toBe(1)
    await vi.waitFor(() => expect(win.closes).toEqual([1]))
    expect(entries()).toEqual({ 'concord:a': '2' })
    expect(fs.calls.filter((c) => c.startsWith('rename'))).toHaveLength(2)
    expect(win.prevented()).toBe(1)
  })

  it('leitura da página que nunca responde: fecha depois de 2 s', async () => {
    vi.useFakeTimers()
    try {
      const { win } = watched(() => new Promise(() => undefined))
      win.userClose()
      await vi.advanceTimersByTimeAsync(1999)
      expect(win.closes).toEqual([])
      await vi.advanceTimersByTimeAsync(1)
      expect(win.closes).toEqual([1])
    } finally {
      vi.useRealTimers()
    }
  })

  it('leitura da página que falha: loga e fecha mesmo assim', async () => {
    const { win, log } = watched(async () => {
      throw new Error('página destruída')
    })
    win.userClose()
    await vi.waitFor(() => expect(win.closes).toEqual([1]))
    expect(log).toHaveBeenCalledWith('[migração] não leu as preferências:', expect.objectContaining({ message: 'página destruída' }))
  })
})
