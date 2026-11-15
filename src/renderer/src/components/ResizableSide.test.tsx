// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { SidePanel } from '@/lib/side-width'
import { ResizableSide } from './ResizableSide'

const panel: SidePanel = { storageKey: 'concord:test-side', initial: 240, min: 200, max: 400 }

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = () => {}
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function renderSide(edge: 'left' | 'right') {
  render(
    <ResizableSide panel={panel} edge={edge} label="Redimensionar">
      <div>conteúdo</div>
    </ResizableSide>
  )
  const handle = screen.getByRole('separator', { name: 'Redimensionar' })
  return { handle, side: handle.parentElement as HTMLElement }
}

function drag(handle: HTMLElement, fromX: number, toX: number) {
  fireEvent.pointerDown(handle, { clientX: fromX, pointerId: 1 })
  fireEvent.pointerMove(handle, { clientX: toX, pointerId: 1 })
  fireEvent.pointerUp(handle, { clientX: toX, pointerId: 1 })
}

describe('ResizableSide', () => {
  it('começa na largura padrão', () => {
    const { side, handle } = renderSide('right')
    expect(side.style.width).toBe('240px')
    expect(handle.getAttribute('aria-valuenow')).toBe('240')
  })

  it('arrastar a borda direita para a direita alarga e guarda a largura', () => {
    const { side, handle } = renderSide('right')
    drag(handle, 500, 560)
    expect(side.style.width).toBe('300px')
    expect(localStorage.getItem(panel.storageKey)).toBe('300')
  })

  it('na borda esquerda, arrastar para a esquerda alarga', () => {
    const { side, handle } = renderSide('left')
    drag(handle, 500, 450)
    expect(side.style.width).toBe('290px')
  })

  it('a largura acompanha o ponteiro durante o arraste e só guarda ao soltar', () => {
    const { side, handle } = renderSide('left')
    fireEvent.pointerDown(handle, { clientX: 500, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 480, pointerId: 1 })
    expect(side.style.width).toBe('260px')
    expect(localStorage.getItem(panel.storageKey)).toBeNull()
  })

  it('respeita o mínimo e o máximo', () => {
    const { side, handle } = renderSide('right')
    drag(handle, 500, 100)
    expect(side.style.width).toBe('200px')
    drag(handle, 500, 1500)
    expect(side.style.width).toBe('400px')
  })

  it('mover o ponteiro sem ter apertado na alça não muda nada', () => {
    const { side, handle } = renderSide('right')
    fireEvent.pointerMove(handle, { clientX: 900, pointerId: 1 })
    expect(side.style.width).toBe('240px')
  })

  it('abre com a largura lembrada', () => {
    localStorage.setItem(panel.storageKey, '333')
    const { side } = renderSide('right')
    expect(side.style.width).toBe('333px')
  })

  it('duplo clique na alça volta ao padrão', () => {
    const { side, handle } = renderSide('right')
    drag(handle, 500, 600)
    fireEvent.doubleClick(handle)
    expect(side.style.width).toBe('240px')
    expect(localStorage.getItem(panel.storageKey)).toBe('240')
  })
})
