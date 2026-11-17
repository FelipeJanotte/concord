import { describe, expect, it } from 'vitest'
import { paginate } from './paginate'

const items = Array.from({ length: 25 }, (_, i) => i + 1)

describe('paginate', () => {
  it('primeira página: os primeiros itens, o total de páginas e de onde a página começa', () => {
    expect(paginate(items, 1, 10)).toEqual({ items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], page: 1, pages: 3, start: 0 })
  })

  it('última página: só o que sobrou', () => {
    expect(paginate(items, 3, 10)).toEqual({ items: [21, 22, 23, 24, 25], page: 3, pages: 3, start: 20 })
  })

  it('página fora do intervalo vai para a mais próxima (a fila pode encolher com a página aberta)', () => {
    expect(paginate(items, 9, 10).page).toBe(3)
    expect(paginate(items, 0, 10).page).toBe(1)
    expect(paginate([1, 2, 3], 2, 10)).toEqual({ items: [1, 2, 3], page: 1, pages: 1, start: 0 })
  })

  it('lista vazia: uma página vazia', () => {
    expect(paginate([], 1, 10)).toEqual({ items: [], page: 1, pages: 1, start: 0 })
  })
})
