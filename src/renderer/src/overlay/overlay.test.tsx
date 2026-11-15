// @vitest-environment jsdom
// Página do overlay em jogos (B15): desenha o que chega pela ponte (sala, quem fala, mute/deafen, +N).
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { OverlayConfig, OverlayRoom, OverlayViewBridge } from '@shared/overlay'
import { OverlayApp } from './OverlayApp'

function fakeBridge() {
  let listener: ((room: OverlayRoom | null, config: OverlayConfig) => void) | null = null
  const bridge: OverlayViewBridge = {
    onUpdate: (fn) => {
      listener = fn
      return () => (listener = null)
    }
  }
  return { bridge, push: (room: OverlayRoom | null, config: OverlayConfig = { enabled: true, corner: 'top-left', size: 'medium' }) => act(() => listener?.(room, config)), has: () => !!listener }
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
      channelName: 'Jogos',
      members: [member('a', 'Ana', { speaking: true }), member('b', 'Bia', { muted: true }), member('c', 'Caio', { deafened: true, muted: true }), member('d', 'Duda', { avatarUrl: 'http://srv/d.png' })],
      more: 4
    })
    expect(screen.getByText('Jogos')).toBeTruthy()
    const items = within(screen.getByRole('list', { name: 'Pessoas na sala' })).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['AAna', 'BBia', 'CCaio', 'Duda', '+4'])
    expect(items[0].dataset.speaking).toBe('true')
    expect(items[1].dataset.speaking).toBeUndefined()
    expect(within(items[1]).getByLabelText('Microfone desligado')).toBeTruthy()
    expect(within(items[2]).getByLabelText('Áudio desativado')).toBeTruthy()
    expect(within(items[2]).queryByLabelText('Microfone desligado')).toBeNull()
    expect(items[3].querySelector('img')?.getAttribute('src')).toBe('http://srv/d.png')
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
