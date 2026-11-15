// Repo de preferências sobre o banco de verdade.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_THEME, type ThemeConfig } from '../../src/shared/types'
import { openTestDatabase } from '../tests/database'
import { insertAccount } from './accounts'
import { getPreferences, updatePreferences } from './preferences'

let cleanup: () => Promise<void>
beforeAll(async () => {
  cleanup = await openTestDatabase()
})
afterAll(async () => {
  await cleanup?.()
})

async function account(): Promise<string> {
  return (
    await insertAccount({
      id: randomUUID(),
      email: `pref-${randomUUID().slice(0, 6)}@teste.com`,
      name: 'Pref',
      tag: `p${randomUUID().slice(0, 8)}`,
      tagLocked: true,
      color: '#5865f2',
      passwordHash: null,
      googleId: null,
      avatarType: null,
      avatarVersion: 0,
      createdAt: Date.now()
    })
  ).id
}

const ocean: ThemeConfig = { base: 'claro', accent: '#0ea5e9', background: { stops: ['#e0f2fe', '#0369a1'], angle: 200 }, intensity: 40 }

describe('preferências', () => {
  it('sem nada salvo: tema padrão e nenhum tema salvo', async () => {
    expect(await getPreferences(await account())).toEqual({ theme: DEFAULT_THEME, savedThemes: [] })
    expect(await getPreferences('nao-uuid')).toEqual({ theme: DEFAULT_THEME, savedThemes: [] })
  })

  it('grava só o que mudou e mantém o resto', async () => {
    const id = await account()
    const saved = [{ id: randomUUID(), name: 'Oceano', theme: ocean }]
    expect(await updatePreferences(id, { savedThemes: saved })).toEqual({ theme: DEFAULT_THEME, savedThemes: saved })
    expect(await updatePreferences(id, { theme: ocean })).toEqual({ theme: ocean, savedThemes: saved })
    expect(await getPreferences(id)).toEqual({ theme: ocean, savedThemes: saved })
    expect(await updatePreferences(id, { savedThemes: [] })).toEqual({ theme: ocean, savedThemes: [] })
  })

  it('cada conta tem as suas', async () => {
    const a = await account()
    const b = await account()
    await updatePreferences(a, { theme: ocean })
    expect((await getPreferences(b)).theme).toEqual(DEFAULT_THEME)
  })
})
