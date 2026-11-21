import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PIP_HEADER, PIP_MIN_WIDTH, clampPip, defaultPip, loadPip, movePip, pipHeight, resizePip, savePip } from './screen-pip'

const viewport = { width: 1280, height: 720 }

describe('miniatura da tela', () => {
  it('a altura segue 16:9 mais o cabeçalho', () => {
    expect(pipHeight(320)).toBe(180 + PIP_HEADER)
  })

  it('começa no canto inferior direito', () => {
    const rect = defaultPip(viewport)
    expect(rect.x + rect.width).toBe(viewport.width - 16)
    expect(rect.y + pipHeight(rect.width)).toBe(viewport.height - 16)
  })

  it('arrastar move e não deixa sair da janela', () => {
    expect(movePip({ x: 100, y: 100, width: 320 }, 50, -30, viewport)).toEqual({ x: 150, y: 70, width: 320 })
    expect(movePip({ x: 100, y: 100, width: 320 }, -500, -500, viewport)).toEqual({ x: 0, y: 0, width: 320 })
    expect(movePip({ x: 100, y: 100, width: 320 }, 5000, 5000, viewport)).toEqual({ x: 960, y: 720 - pipHeight(320), width: 320 })
  })

  it('redimensionar pelo canto respeita o mínimo e o tamanho da janela', () => {
    expect(resizePip({ x: 0, y: 0, width: 320 }, 80, viewport).width).toBe(400)
    expect(resizePip({ x: 0, y: 0, width: 320 }, -500, viewport).width).toBe(PIP_MIN_WIDTH)
    const big = resizePip({ x: 0, y: 0, width: 320 }, 5000, viewport)
    expect(pipHeight(big.width)).toBeLessThanOrEqual(viewport.height)
    expect(big.width).toBeLessThanOrEqual(viewport.width)
  })

  it('janela que encolheu puxa a miniatura para dentro', () => {
    expect(clampPip({ x: 1200, y: 600, width: 320 }, { width: 800, height: 600 })).toEqual({ x: 480, y: 600 - pipHeight(320), width: 320 })
  })
})

describe('miniatura guardada na máquina', () => {
  let storage: Map<string, string>
  beforeEach(() => {
    storage = new Map()
    vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('guarda e lê a posição e o tamanho', () => {
    expect(loadPip()).toBeNull()
    savePip({ x: 10, y: 20, width: 400 })
    expect(loadPip()).toEqual({ x: 10, y: 20, width: 400 })
  })

  it('valor estragado é ignorado', () => {
    storage.set('concord:screen-pip', '{"x":"a"}')
    expect(loadPip()).toBeNull()
  })
})
