// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clampWidth, loadSideWidth, saveSideWidth, type SidePanel } from './side-width'

const panel: SidePanel = { storageKey: 'concord:test-width', initial: 240, min: 200, max: 400 }

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('clampWidth', () => {
  it('mantém a largura dentro dos limites', () => {
    expect(clampWidth(100, panel)).toBe(200)
    expect(clampWidth(999, panel)).toBe(400)
    expect(clampWidth(300, panel)).toBe(300)
  })

  it('arredonda para pixel inteiro', () => {
    expect(clampWidth(250.6, panel)).toBe(251)
  })
})

describe('largura guardada na máquina', () => {
  it('sem nada guardado usa a largura padrão', () => {
    expect(loadSideWidth(panel)).toBe(240)
  })

  it('devolve a largura salva', () => {
    saveSideWidth(panel, 320)
    expect(loadSideWidth(panel)).toBe(320)
  })

  it('valor guardado fora dos limites ou inválido volta para dentro', () => {
    localStorage.setItem(panel.storageKey, '9999')
    expect(loadSideWidth(panel)).toBe(400)
    localStorage.setItem(panel.storageKey, 'abc')
    expect(loadSideWidth(panel)).toBe(240)
  })

  it('sem armazenamento disponível não quebra', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(() => saveSideWidth(panel, 300)).not.toThrow()
    expect(loadSideWidth(panel)).toBe(240)
  })
})
