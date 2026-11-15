/**
 * Tamanho dos quadros da grade da sala de voz (como no Discord): dado quantos quadros e o espaço
 * disponível, escolhe o número de colunas que deixa cada quadro (16:9) o maior possível, sem passar
 * da área. A grade fica centralizada e os quadros crescem/encolhem com a janela e com quem entra/sai.
 */
import { useEffect, useState, type RefObject } from 'react'

export interface TileLayout {
  columns: number
  /** largura de cada quadro, em px (a altura sai do 16:9) */
  width: number
}

export interface TileLayoutOptions {
  /** espaço entre os quadros (px) */
  gap?: number
  /** largura / altura do quadro */
  aspect?: number
  /** largura mínima (abaixo disso a grade rola) */
  minWidth?: number
  /** largura máxima (sem altura definida, como no painel da chamada, é o que limita) */
  maxWidth?: number
}

/**
 * Melhor layout para `count` quadros numa área `width` x `height`. `height` = Infinity quando a área
 * não tem altura definida (o quadro só é limitado pela largura e por `maxWidth`).
 */
export function bestTileLayout(count: number, width: number, height: number, opts: TileLayoutOptions = {}): TileLayout {
  const { gap = 16, aspect = 16 / 9, minWidth = 160, maxWidth = Infinity } = opts
  if (count <= 0 || width <= 0) return { columns: 1, width: minWidth }
  const boundedHeight = Number.isFinite(height)
  let best: TileLayout = { columns: 1, width: 0 }
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns)
    const byWidth = (width - gap * (columns - 1)) / columns
    const byHeight = boundedHeight ? ((height - gap * (rows - 1)) / rows) * aspect : Infinity
    const tile = Math.min(byWidth, byHeight, maxWidth)
    // empate: com altura definida, menos colunas (mais "quadrado"); sem altura, mais colunas
    // (os quadros, já no tamanho máximo, ficam lado a lado em vez de empilhados)
    if (tile > best.width + 0.5 || (!boundedHeight && Math.abs(tile - best.width) <= 0.5)) best = { columns, width: tile }
  }
  // muita gente para o espaço: mantém um tamanho legível e deixa rolar
  if (best.width < minWidth) {
    const columns = Math.max(1, Math.floor((width + gap) / (minWidth + gap)))
    return { columns, width: Math.min(minWidth, width) }
  }
  return { columns: best.columns, width: Math.floor(best.width) }
}

/** Tamanho atual de um elemento (0 x 0 até medir; sem ResizeObserver, fica em 0 x 0). */
export function useElementSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = (): void => {
      const width = el.clientWidth
      const height = el.clientHeight
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return size
}
