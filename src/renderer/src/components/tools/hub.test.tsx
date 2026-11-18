// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Channel } from '@shared/types'
import { UtilityRail } from '@/components/rail/UtilityRail'
import { TooltipProvider } from '@/components/ui/tooltip'
import { openTool, selectTextChannel, showHome, showTools } from '@/lib/client'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { TOOLS, TOOL_GROUPS } from './registry'
import { ToolsSidebar } from './ToolsSidebar'
import { ToolView } from './ToolView'

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }

function renderHub() {
  render(
    <TooltipProvider>
      <UtilityRail />
      <ToolsSidebar />
      <ToolView />
    </TooltipProvider>
  )
}

const sidebar = () => screen.getByRole('complementary')

beforeEach(() => {
  const socket = new FakeSocket()
  setSocket(socket.asSocket())
  socket.replyTo('message:history', () => ({ messages: [], hasMore: false }))
  useApp.setState({
    ...initialState,
    self: { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null },
    channels: [geral]
  })
})

afterEach(() => {
  cleanup()
  setSocket(null)
})

describe('registro', () => {
  it('cada ferramenta tem grupo e descrição; os grupos têm rótulo', () => {
    expect(TOOLS.map((t) => [t.id, t.group])).toEqual([
      ['teams', 'community'],
      ['dice', 'fun'],
      ['coin', 'fun'],
      ['pick', 'fun'],
      ['poll', 'community']
    ])
    expect(TOOLS.every((t) => t.description.length > 0)).toBe(true)
    expect(TOOL_GROUPS.map((g) => g.label)).toEqual(['Comunidade', 'Diversão'])
  })
})

describe('barra de úteis', () => {
  it('tem um só botão "Ferramentas" e nenhum por ferramenta', () => {
    renderHub()
    const rail = screen.getByRole('navigation', { name: 'Barra de úteis' })
    expect(within(rail).getAllByRole('button', { name: 'Ferramentas' })).toHaveLength(1)
    for (const tool of TOOLS) expect(within(rail).queryByRole('button', { name: tool.name })).toBeNull()
  })

  it('a primeira vez abre a galeria com os dois grupos e todas as ferramentas', async () => {
    renderHub()
    const rail = screen.getByRole('navigation', { name: 'Barra de úteis' })
    await userEvent.click(within(rail).getByRole('button', { name: 'Ferramentas' }))
    expect(useApp.getState()).toMatchObject({ section: 'tool', toolId: null })
    const gallery = screen.getByRole('region', { name: 'Galeria de ferramentas' })
    expect(within(gallery).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Comunidade', 'Diversão'])
    for (const tool of TOOLS) expect(within(gallery).getByRole('button', { name: new RegExp(tool.name) })).toBeTruthy()
  })
})

describe('abrir uma ferramenta', () => {
  it('o cartão abre o painel, a barra lateral marca e limpa o canal do composer', async () => {
    openTool('dice', 'geral')
    useApp.setState({ toolId: null })
    renderHub()
    const gallery = screen.getByRole('region', { name: 'Galeria de ferramentas' })
    await userEvent.click(within(gallery).getByRole('button', { name: /Enquete/ }))
    expect(useApp.getState()).toMatchObject({ section: 'tool', toolId: 'poll', toolChannelId: null })
    expect(screen.getByRole('heading', { level: 1, name: 'Enquete' })).toBeTruthy()
    expect(within(sidebar()).getByRole('button', { name: 'Enquete' }).getAttribute('aria-current')).toBe('page')
    expect(within(sidebar()).getByRole('button', { name: 'Dado' }).getAttribute('aria-current')).toBeNull()
  })

  it('a barra lateral agrupa as ferramentas e o cabeçalho "Ferramentas" volta à galeria', async () => {
    openTool('coin', 'geral')
    renderHub()
    const headings = within(sidebar()).getAllByRole('heading', { level: 2 })
    expect(headings.map((h) => h.textContent)).toEqual(['Comunidade', 'Diversão'])
    await userEvent.click(within(sidebar()).getByRole('button', { name: 'Ferramentas' }))
    expect(useApp.getState()).toMatchObject({ section: 'tool', toolId: null, toolChannelId: null })
    expect(screen.getByRole('region', { name: 'Galeria de ferramentas' })).toBeTruthy()
    expect(within(sidebar()).getByRole('button', { name: 'Ferramentas' }).getAttribute('aria-current')).toBe('page')
  })

  it('Início e voltar por "Ferramentas" reabre a última ferramenta', async () => {
    openTool('pick')
    renderHub()
    const rail = screen.getByRole('navigation', { name: 'Barra de úteis' })
    await userEvent.click(within(rail).getByRole('button', { name: 'Início' }))
    expect(useApp.getState().section).toBe('home')
    await userEvent.click(within(rail).getByRole('button', { name: 'Ferramentas' }))
    expect(useApp.getState()).toMatchObject({ section: 'tool', toolId: 'pick' })
    expect(within(rail).getByRole('button', { name: 'Ferramentas' }).getAttribute('aria-current')).toBe('page')
  })

  it('abrir pelo composer guarda o canal; voltar pelo hub limpa e mantém a ferramenta', () => {
    openTool('dice', 'geral')
    expect(useApp.getState().toolChannelId).toBe('geral')
    showHome()
    showTools()
    expect(useApp.getState()).toMatchObject({ section: 'tool', toolId: 'dice', toolChannelId: null })
  })

  it('escolher um canal de texto sai da seção de ferramentas', () => {
    openTool('dice')
    selectTextChannel('geral')
    expect(useApp.getState().section).toBe('community')
  })

  it('id desconhecido mostra "Ferramenta não encontrada"', () => {
    useApp.setState({ section: 'tool', toolId: 'sumiu' })
    renderHub()
    expect(screen.getByText('Ferramenta não encontrada.')).toBeTruthy()
  })
})
