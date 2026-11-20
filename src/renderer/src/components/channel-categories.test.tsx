// @vitest-environment jsdom
import '@/test/ui-sdk-dom'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, type AccessState, type Channel, type ChannelCategory, type User } from '@shared/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { ChannelSidebar } from './ChannelSidebar'

const user = (accountId: string): User => ({ id: `sock-${accountId}`, accountId, name: accountId, tag: accountId, color: '#000', avatarUrl: null })
const ch = (id: string, position: number, categoryId: string | null = null, type: Channel['type'] = 'text'): Channel => ({
  id,
  name: id,
  type,
  createdAt: 0,
  position,
  categoryId
})
const jogos: ChannelCategory = { id: 'k1', name: 'Jogos', position: 0 }
const vazia: ChannelCategory = { id: 'k2', name: 'Vazia', position: 1 }

const access: AccessState = {
  ownerAccountId: 'dona',
  roles: [{ id: EVERYONE_ROLE_ID, name: '@todos', color: null, position: 0, permissions: ['view', 'send', 'connect'] }],
  members: [],
  overrides: []
}

let socket: FakeSocket

function login(accountId: string): void {
  useApp.setState({
    ...initialState,
    self: user(accountId),
    users: [user(accountId)],
    access,
    channels: [ch('sala', 2, 'k1', 'voice'), ch('geral', 0), ch('regras', 1, 'k1')],
    categories: [vazia, jogos],
    view: { kind: 'text', channelId: 'geral' }
  })
}

function dataTransfer() {
  const data = new Map<string, string>()
  return {
    get types() {
      return [...data.keys()]
    },
    setData: (k: string, v: string) => void data.set(k, v),
    getData: (k: string) => data.get(k) ?? '',
    effectAllowed: '',
    dropEffect: ''
  }
}

const sidebar = () =>
  render(
    <TooltipProvider>
      <ChannelSidebar />
    </TooltipProvider>
  )

const row = (name: string): HTMLElement => screen.getByText(name).closest('[data-muted]') as HTMLElement

beforeEach(() => {
  localStorage.clear()
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  socket.replyTo('channel:layout', () => ({ ok: true }))
  socket.replyTo('category:rename', (p) => ({ ok: true, category: { ...jogos, name: (p as { name: string }).name } }))
})

afterEach(() => {
  cleanup()
  setSocket(null)
})

describe('categorias na barra lateral', () => {
  it('sem categoria no topo; cada categoria com texto e voz juntos pela posição', () => {
    login('dona')
    sidebar()
    const regions = screen.getAllByRole('region')
    expect(regions.map((r) => r.getAttribute('aria-label'))).toEqual(['Canais sem categoria', 'Jogos', 'Vazia'])
    expect(within(regions[1]!).getAllByText(/regras|sala/).map((el) => el.textContent)).toEqual(['regras', 'sala'])
  })

  it('quem não gerencia canais não vê a categoria vazia nem pode arrastar', () => {
    login('davi')
    sidebar()
    expect(screen.queryByRole('region', { name: 'Vazia' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Jogos' })).toBeTruthy()
    expect(row('geral').getAttribute('draggable')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Criar' })).toBeNull()
  })

  it('recolher a categoria esconde os canais e fica guardado na máquina', async () => {
    login('davi')
    const { unmount } = sidebar()
    await userEvent.click(screen.getByRole('button', { name: 'Jogos' }))
    expect(screen.queryByText('regras')).toBeNull()
    unmount()
    sidebar()
    expect(screen.queryByText('regras')).toBeNull()
    expect(screen.getByRole('button', { name: 'Jogos' }).getAttribute('aria-expanded')).toBe('false')
  })

  it('arrastar um canal para antes de outro de outra categoria manda a ordem inteira', () => {
    login('dona')
    sidebar()
    const transfer = dataTransfer()
    fireEvent.dragStart(row('geral'), { dataTransfer: transfer })
    fireEvent.dragOver(row('sala'), { dataTransfer: transfer })
    fireEvent.drop(row('sala'), { dataTransfer: transfer })
    expect(socket.sent('channel:layout')[0]![0]).toEqual({
      categories: ['k1', 'k2'],
      channels: [
        { id: 'regras', categoryId: 'k1' },
        { id: 'geral', categoryId: 'k1' },
        { id: 'sala', categoryId: 'k1' }
      ]
    })
  })

  it('arrastar uma categoria para antes de outra reordena as categorias', () => {
    login('dona')
    sidebar()
    const transfer = dataTransfer()
    const header = (name: string) => screen.getByRole('button', { name }).parentElement as HTMLElement
    fireEvent.dragStart(header('Vazia'), { dataTransfer: transfer })
    fireEvent.dragOver(header('Jogos'), { dataTransfer: transfer })
    fireEvent.drop(header('Jogos'), { dataTransfer: transfer })
    expect(socket.sent('channel:layout')[0]![0]).toMatchObject({ categories: ['k2', 'k1'] })
  })

  it('arrastar uma pessoa entre salas continua sem mexer na ordem', () => {
    login('dona')
    sidebar()
    const transfer = dataTransfer()
    transfer.setData('application/x-concord-voice-user', 'sock-ana')
    fireEvent.dragOver(row('sala'), { dataTransfer: transfer })
    fireEvent.drop(row('sala'), { dataTransfer: transfer })
    expect(socket.sent('channel:layout')).toHaveLength(0)
  })

  it('o + da categoria cria o canal dentro dela', async () => {
    socket.replyTo('channel:create', () => ({ ok: true, channel: ch('novo', 3, 'k1') }))
    login('dona')
    sidebar()
    const section = screen.getByRole('region', { name: 'Jogos' })
    await userEvent.click(within(section).getByRole('button', { name: 'Criar canal' }))
    await userEvent.type(screen.getByLabelText('Nome do canal'), 'novo')
    await userEvent.click(screen.getByRole('button', { name: 'Criar canal' }))
    expect(socket.sent('channel:create')[0]![0]).toEqual({ name: 'novo', type: 'text', categoryId: 'k1' })
  })

  it('botão direito na categoria: renomear', async () => {
    login('dona')
    sidebar()
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Jogos' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Renomear categoria' }))
    const input = screen.getByRole('textbox', { name: 'Nome da categoria' })
    await userEvent.clear(input)
    await userEvent.type(input, 'Jogatina')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(socket.sent('category:rename')[0]![0]).toEqual({ categoryId: 'k1', name: 'Jogatina' })
  })
})
