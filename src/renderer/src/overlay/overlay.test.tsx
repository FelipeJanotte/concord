// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OVERLAY_GAP, OVERLAY_METRICS, OVERLAY_PADDING, type OverlayConfig, type OverlayRoom, type OverlayViewBridge } from '@shared/overlay'
import type { ThemeConfig } from '@shared/types'
import { OverlayApp } from './OverlayApp'

const CONFIG: OverlayConfig = { enabled: true, corner: 'top-left', size: 'medium', position: null, width: null }

function fakeBridge() {
  let listener: ((room: OverlayRoom | null, config: OverlayConfig, editing: boolean) => void) | null = null
  let themeListener: ((theme: ThemeConfig) => void) | null = null
  const finishEditing = vi.fn()
  const resize = vi.fn()
  const bridge: OverlayViewBridge = {
    onUpdate: (fn) => {
      listener = fn
      return () => (listener = null)
    },
    finishEditing,
    resize,
    onTheme: (fn) => {
      themeListener = fn
      return () => (themeListener = null)
    }
  }
  return {
    bridge,
    finishEditing,
    resize,
    pushTheme: (theme: unknown) => act(() => themeListener?.(theme as ThemeConfig)),
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
    expect(screen.getByRole('list', { name: 'Pessoas na sala' }).previousElementSibling).toBeNull()
    const items = within(screen.getByRole('list', { name: 'Pessoas na sala' })).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['AAna', 'BBia', 'CCaio', 'Duda', '+4'])
    expect(items[0].dataset.speaking).toBe('true')
    expect(items[1].dataset.speaking).toBeUndefined()
    expect(items[0].firstElementChild?.classList).toContain('ring-primary')
    expect(items[1].firstElementChild?.classList).not.toContain('ring-primary')
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

describe('redimensionar arrastando', () => {
  it('só no modo de mover: arrastar a alça manda a largura nova e, ao soltar, a final', () => {
    const { bridge, push, resize } = fakeBridge()
    render(<OverlayApp bridge={bridge} />)
    push({ members: [member('a', 'Ana')], more: 0 })
    expect(screen.queryByRole('separator', { name: 'Redimensionar' })).toBeNull()
    push({ members: [member('a', 'Ana')], more: 0 }, CONFIG, true)
    const grip = screen.getByRole('separator', { name: 'Redimensionar' })
    fireEvent.pointerDown(grip, { screenX: 100, pointerId: 1 })
    fireEvent.pointerMove(grip, { screenX: 160, pointerId: 1 })
    expect(resize).toHaveBeenLastCalledWith(OVERLAY_METRICS.medium.width + 60, false)
    fireEvent.pointerUp(grip, { screenX: 170, pointerId: 1 })
    expect(resize).toHaveBeenLastCalledWith(OVERLAY_METRICS.medium.width + 70, true)
    fireEvent.pointerMove(grip, { screenX: 400, pointerId: 1 })
    expect(resize).toHaveBeenCalledTimes(2)
  })

  it('no canto da direita a alça fica à esquerda e arrastar para a esquerda alarga', () => {
    const { bridge, push, resize } = fakeBridge()
    render(<OverlayApp bridge={bridge} />)
    push({ members: [member('a', 'Ana')], more: 0 }, { ...CONFIG, corner: 'top-right', width: 400 }, true)
    const grip = screen.getByRole('separator', { name: 'Redimensionar' })
    expect(grip.className).toContain('left-0')
    fireEvent.pointerDown(grip, { screenX: 500, pointerId: 1 })
    fireEvent.pointerUp(grip, { screenX: 450, pointerId: 1 })
    expect(resize).toHaveBeenLastCalledWith(450, true)
  })
})

describe('tema ao vivo', () => {
  it('aplica o tema que chega do app; tema inválido é ignorado', () => {
    const { bridge, pushTheme } = fakeBridge()
    render(<OverlayApp bridge={bridge} />)
    pushTheme({ base: 'claro', accent: '#ff0055', background: { stops: ['#ffffff'], angle: 180 }, intensity: 0 })
    expect(document.documentElement.dataset.themeBase).toBe('claro')
    pushTheme({ base: 'neon' })
    expect(document.documentElement.dataset.themeBase).toBe('claro')
    pushTheme({ base: 'escuro', accent: '#5865f2', background: { stops: ['#313338'], angle: 180 }, intensity: 0 })
    expect(document.documentElement.dataset.themeBase).toBe('escuro')
  })
})
