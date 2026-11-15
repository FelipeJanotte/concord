import { describe, expect, it } from 'vitest'
import { bestTileLayout } from './tile-layout'

describe('bestTileLayout', () => {
  it('uma pessoa: um quadro grande, limitado pela altura (16:9)', () => {
    // 1000 x 400: pela largura seria 1000, mas a altura só deixa 400 * 16/9 ≈ 711
    expect(bestTileLayout(1, 1000, 400)).toEqual({ columns: 1, width: 711 })
  })

  it('duas pessoas numa área larga: lado a lado; numa área alta: uma em cima da outra', () => {
    expect(bestTileLayout(2, 1200, 500).columns).toBe(2)
    expect(bestTileLayout(2, 500, 1200).columns).toBe(1)
  })

  it('o quadro nunca passa da área (contando os espaços)', () => {
    for (const [n, w, h] of [
      [3, 900, 600],
      [5, 1280, 720],
      [7, 800, 900],
      [12, 1600, 900]
    ]) {
      const { columns, width } = bestTileLayout(n, w, h)
      const rows = Math.ceil(n / columns)
      expect(columns * width + 16 * (columns - 1)).toBeLessThanOrEqual(w)
      expect(rows * ((width * 9) / 16) + 16 * (rows - 1)).toBeLessThanOrEqual(h + 1)
    }
  })

  it('escolhe as colunas que deixam o quadro maior (4 numa tela 16:9 = 2 x 2)', () => {
    expect(bestTileLayout(4, 1280, 720).columns).toBe(2)
    expect(bestTileLayout(9, 1280, 720).columns).toBe(3)
  })

  it('sem altura definida: só a largura e o máximo contam', () => {
    expect(bestTileLayout(1, 1000, Infinity, { maxWidth: 320 })).toEqual({ columns: 1, width: 320 })
    // os três cabem lado a lado no tamanho máximo: não empilha
    expect(bestTileLayout(3, 1000, Infinity, { maxWidth: 320 })).toEqual({ columns: 3, width: 320 })
    // quatro não cabem lado a lado em 320: três por linha, encolhendo o mínimo
    expect(bestTileLayout(4, 1000, Infinity, { maxWidth: 320 }).columns).toBe(3)
  })

  it('gente demais para o espaço: tamanho mínimo legível (a grade rola)', () => {
    const { columns, width } = bestTileLayout(40, 800, 300)
    expect(width).toBe(160)
    expect(columns).toBe(4) // (800 + 16) / (160 + 16)
  })

  it('casos vazios não quebram', () => {
    expect(bestTileLayout(0, 800, 600).columns).toBe(1)
    expect(bestTileLayout(3, 0, 600).columns).toBe(1)
  })
})
