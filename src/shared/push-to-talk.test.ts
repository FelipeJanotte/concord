// Pressione para falar (B20): validação da tecla escolhida e da configuração.
import { describe, expect, it } from 'vitest'
import { cleanBinding, cleanPttConfig } from './push-to-talk'

describe('cleanBinding', () => {
  it('aceita tecla e botões do mouse 3, 4 e 5; corta o nome', () => {
    expect(cleanBinding({ kind: 'key', code: 47, label: 'V' })).toEqual({ kind: 'key', code: 47, label: 'V' })
    expect(cleanBinding({ kind: 'mouse', code: 4, label: 'Botão 4 do mouse' })?.code).toBe(4)
    expect(cleanBinding({ kind: 'key', code: 47, label: 'x'.repeat(50) })?.label).toHaveLength(32)
    expect(cleanBinding({ kind: 'key', code: 47 })?.label).toBe('Tecla 47')
  })

  it('recusa o resto', () => {
    expect(cleanBinding(null)).toBeNull()
    expect(cleanBinding({ kind: 'joystick', code: 1, label: 'A' })).toBeNull()
    expect(cleanBinding({ kind: 'mouse', code: 1, label: 'Esquerdo' })).toBeNull()
    expect(cleanBinding({ kind: 'key', code: 0, label: 'x' })).toBeNull()
    expect(cleanBinding({ kind: 'key', code: 4.5, label: 'x' })).toBeNull()
    expect(cleanBinding({ kind: 'key', code: '47', label: 'x' })).toBeNull()
  })
})

describe('cleanPttConfig', () => {
  it('só "true" liga; tecla inválida vira null', () => {
    expect(cleanPttConfig({ enabled: true, binding: { kind: 'key', code: 47, label: 'V' } })).toEqual({
      enabled: true,
      binding: { kind: 'key', code: 47, label: 'V' }
    })
    expect(cleanPttConfig({ enabled: 1, binding: 'V' })).toEqual({ enabled: false, binding: null })
    expect(cleanPttConfig(undefined)).toEqual({ enabled: false, binding: null })
  })
})
