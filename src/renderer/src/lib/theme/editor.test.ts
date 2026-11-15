// Editor de temas: cores do gradiente, comparação, tema pronto correspondente e temas salvos.
import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, type SavedTheme, type ThemeConfig } from '@shared/types'
import { addSavedTheme, addStop, copyName, matchingPreset, removeSavedTheme, removeStop, sameTheme, setStop } from './editor'
import { THEME_PRESETS } from './presets'

const base: ThemeConfig = { base: 'escuro', accent: '#5865f2', background: { stops: ['#111111', '#222222'], angle: 90 }, intensity: 50 }

describe('cores do gradiente', () => {
  it('adiciona repetindo a última, até 4; remove deixando pelo menos 1', () => {
    expect(addStop(base).background.stops).toEqual(['#111111', '#222222', '#222222'])
    const four = addStop(addStop(base))
    expect(addStop(four)).toBe(four)
    expect(removeStop(base, 0).background.stops).toEqual(['#222222'])
    const one = removeStop(base, 1)
    expect(removeStop(one, 0)).toBe(one)
    expect(removeStop(base, 5)).toBe(base)
  })

  it('setStop troca só a cor indicada (em minúsculas) e não mexe no original', () => {
    expect(setStop(base, 1, '#ABCDEF').background.stops).toEqual(['#111111', '#abcdef'])
    expect(base.background.stops).toEqual(['#111111', '#222222'])
  })
})

describe('comparação e temas prontos', () => {
  it('sameTheme compara campo a campo', () => {
    expect(sameTheme(base, { ...base, background: { ...base.background, stops: [...base.background.stops] } })).toBe(true)
    expect(sameTheme(base, { ...base, intensity: 51 })).toBe(false)
    expect(sameTheme(base, setStop(base, 0, '#000000'))).toBe(false)
  })

  it('matchingPreset acha o tema pronto igual', () => {
    expect(matchingPreset(DEFAULT_THEME)?.id).toBe('padrao')
    expect(matchingPreset(THEME_PRESETS[3].theme)?.id).toBe(THEME_PRESETS[3].id)
    expect(matchingPreset(base)).toBeUndefined()
  })
})

describe('temas salvos', () => {
  it('copyName acrescenta "(cópia)" sem passar de 32 caracteres', () => {
    expect(copyName('Oceano')).toBe('Oceano (cópia)')
    expect(copyName('x'.repeat(32))).toHaveLength(32)
  })

  it('addSavedTheme limpa o nome, recusa nome vazio e lista cheia', () => {
    const one = addSavedTheme([], '  Meu   tema ', base, 'id-1')
    expect(one).toEqual([{ id: 'id-1', name: 'Meu tema', theme: base }])
    expect(addSavedTheme([], '   ', base)).toBe('Dê um nome de 1 a 32 caracteres')
    const full: SavedTheme[] = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, theme: base }))
    expect(addSavedTheme(full, 'Mais um', base)).toBe('Você pode salvar até 10 temas. Apague um antes.')
    const generated = addSavedTheme([], 'Com id', base)
    expect(Array.isArray(generated) && generated[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('removeSavedTheme tira pelo id', () => {
    const list: SavedTheme[] = [
      { id: 'a', name: 'A', theme: base },
      { id: 'b', name: 'B', theme: base }
    ]
    expect(removeSavedTheme(list, 'a').map((t) => t.id)).toEqual(['b'])
  })
})
