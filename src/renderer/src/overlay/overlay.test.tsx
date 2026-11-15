// @vitest-environment jsdom
// Página do overlay em jogos (B15): desenha o que chega pela ponte (sala, quem fala, mute/deafen, +N)
// e o modo de mover (moldura arrastável, prévia fora de sala, "Concluir" e Esc).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OVERLAY_GAP, OVERLAY_METRICS, OVERLAY_PADDING, type OverlayConfig, type OverlayRoom, type OverlayViewBridge } from '@shared/overlay'
import { OverlayApp } from './OverlayApp'

const CONFIG: OverlayConfig = { enabled: true, corner: 'top-left', size: 'medium', position: null }

function fakeBridge() {
  let listener: ((room: OverlayRoom | null, config: OverlayConfig, editing: boolean) => void) | null = null
  const finishEditing = vi.fn()
  const bridge: OverlayViewBridge = {
    onUpdate: (fn) => {
      listener = fn
      return () => (listener = null)
    },
    finishEditing
  }
  return {
    bridge,
    finishEditing,
    push: (room: OverlayRoom | null, config: OverlayConfig = CONFIG, editing = false) => act(() => listener?.(room, config, editing)),
    has: () => !!listener
  }
}

const member = (id: string, name: string, extra = {}) => ({ id, name, avatarUrl: null, color: '#123456', speaking: false, muted: false, deafened: false, ...extra })

afterEach(cleanup)

describe('OverlayApp', () => {
  it('antes de chegar a sala, e fora de sala: nada', () => {
    const { bridge, push } = fakeBridge()
    const { container } = render(<OverlayApp bridge={bridge} />)
    expect(container.innerHTML).toBe('')
    push(null)
    expect(container.innerHTML).toBe('')
  })

  it('mostra a sala, quem fala em destaque, mute/deafen e "+N"', () => {
    const { bridge, push } = fakeBridge()
    render(<OverlayApp bridge={bridge} />)
    push({
      members: [member('a', 'Ana', { speaking: true }), member('b', 'Bia', { muted: true }), member('c', 'Caio', { deafened: true, muted: true }), member('d', 'Duda', { avatarUrl: 'http://srv/d.png' })],
      more: 4
    })
    // só as pessoas: sem a linha com o nome da sala em cima
    expect(screen.getByRole('list', { name: 'Pessoas na sala' }).previousElementSibling).toBeNull()
    const items = within(screen.getByRole('list', { name: 'Pessoas na sala' })).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['AAna', 'BBia', 'CCaio', 'Duda', '+4'])
    expect(items[0].dataset.speaking).toBe('true')
    expect(items[1].dataset.speaking).toBeUndefined()
    expect(within(items[1]).getByLabelText('Microfone desligado')).toBeTruthy()
    expect(within(items[2]).getByLabelText('Áudio desativado')).toBeTruthy()
    expect(within(items[2]).queryByLabelText('Microfone desligado')).toBeNull()
    expect(items[3].querySelector('img')?.getAttribute('src')).toBe('http://srv/d.png')
    expect(screen.queryByText('Arraste para mover')).toBeNull()
  })

  it('para de ouvir ao desmontar; sem ponte (navegador) não quebra', () => {
    const { bridge, has } = fakeBridge()
    const { unmount } = render(<OverlayApp bridge={bridge} />)
    expect(has()).toBe(true)
    unmount()
    expect(has()).toBe(false)
    expect(() => render(<OverlayApp bridge={null} />)).not.toThrow()
  })
})

describe('alturas (sem cortar embaixo)', () => {
  it('cada linha tem a altura de OVERLAY_METRICS, com o espaço e a margem compartilhados com a janela', () => {
    const { bridge, push } = fakeBridge()
    const { container } = render(<OverlayApp bridge={bridge} />)
    for (const size of ['small', 'medium', 'large'] as const) {
      push({ members: [member('a', 'Ana'), member('b', 'Bia')], more: 3 }, { ...CONFIG, size })
      const items = within(screen.getByRole('list', { name: 'Pessoas na sala' })).getAllByRole('listitem')
      expect(items.map((li) => li.style.height)).toEqual(Array(3).fill(`${OVERLAY_METRICS[size].line}px`))
      const foto = items[0].querySelector('span') as HTMLElement
      expect(foto.style.height).toBe(`${OVERLAY_METRICS[size].avatar}px`)
    }
    const root = container.firstElementChild as HTMLElement
    expect([root.style.padding, root.style.gap]).toEqual([`${OVERLAY_PADDING}px`, `${OVERLAY_GAP}px`])
  })

  it('no modo de mover a moldura é outline (não ocupa altura) e a barra tem a altura de uma linha', () => {
    const { bridge, push } = fakeBridge()
    const { container } = render(<OverlayApp bridge={bridge} />)
    push({ members: [member('a', 'Ana')], more: 0 }, CONFIG, true)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('outline-dashed')
    expect(root.className).not.toMatch(/(^|\s)border(-|\s|$)/)
    expect((screen.getByText('Arraste para mover').parentElement as HTMLElement).style.height).toBe(`${OVERLAY_METRICS.medium.line}px`)
  })
})

describe('modo de mover', () => {
  it('moldura arrastável com "Arraste para mover" e "Concluir" (que não arrasta)', async () => {
    const { bridge, push, finishEditing } = fakeBridge()
    const { container } = render(<OverlayApp bridge={bridge} />)
    push({ members: [member('a', 'Ana')], more: 0 }, CONFIG, true)
    const root = container.firstElementChild as HTMLElement
    expect(root.dataset.editing).toBe('true')
    expect(root.style.getPropertyValue('-webkit-app-region') || (root.style as unknown as Record<string, string>).WebkitAppRegion).toBe('drag')
    expect(screen.getByText('Arraste para mover')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(finishEditing).toHaveBeenCalledTimes(1)
  })

  it('fora de sala mostra uma prévia para ter o que arrastar', () => {
    const { bridge, push } = fakeBridge()
    render(<OverlayApp bridge={bridge} />)
    push(null, CONFIG, true)
    expect(screen.getByText('Prévia')).toBeTruthy()
    push(null, CONFIG, false)
    expect(screen.queryByText('Prévia')).toBeNull()
  })

  it('Esc trava de novo; fora do modo de mover o Esc não faz nada', () => {
    const { bridge, push, finishEditing } = fakeBridge()
    render(<OverlayApp bridge={bridge} />)
    push({ members: [member('a', 'Ana')], more: 0 })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(finishEditing).not.toHaveBeenCalled()
    push({ members: [member('a', 'Ana')], more: 0 }, CONFIG, true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(finishEditing).toHaveBeenCalledTimes(1)
  })

  it('arrastado para um lugar livre, não alinha pelo canto (cresce para baixo, à esquerda)', () => {
    const { bridge, push } = fakeBridge()
    const { container } = render(<OverlayApp bridge={bridge} />)
    push({ members: [member('a', 'Ana')], more: 0 }, { ...CONFIG, corner: 'bottom-right', position: { x: 10, y: 10 } })
    const root = container.firstElementChild as HTMLElement
    expect(root.className).not.toContain('justify-end')
    expect(root.className).not.toContain('items-end')
  })
})
