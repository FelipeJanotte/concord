// @vitest-environment jsdom
// Componentes da tela compartilhada: seletor, tile da tela e grade da sala.
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScreenShareBridge, ScreenSource } from '@shared/screen'
import type { User, VoiceState } from '@shared/types'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { ScreenPicker } from './ScreenPicker'
import { ScreenTile } from './ScreenTile'
import { VoiceGrid } from './VoiceGrid'

const user = (id: string, name: string): User => ({ id, accountId: `acc-${id}`, name, tag: id, color: '#5865f2', avatarUrl: null })
const state = (userId: string, extra: Partial<VoiceState> = {}): VoiceState => ({
  userId,
  channelId: 'sala',
  muted: false,
  deafened: false,
  sharing: false,
  ...extra
})

const SOURCES: ScreenSource[] = [
  { id: 'screen:0:0', name: 'Tela 1', kind: 'screen', thumbnail: 'data:image/png;base64,AA==', appIcon: null },
  { id: 'screen:1:0', name: 'Tela 2', kind: 'screen', thumbnail: 'data:image/png;base64,AA==', appIcon: null },
  { id: 'window:7:0', name: 'Navegador', kind: 'window', thumbnail: 'data:image/png;base64,AA==', appIcon: 'data:image/png;base64,AA==' }
]

let bridge: ScreenShareBridge & { getSources: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn> }
let socket: FakeSocket

beforeEach(() => {
  useApp.setState({
    ...initialState,
    self: user('eu', 'Eu'),
    users: [user('eu', 'Eu'), user('ana', 'Ana'), user('bia', 'Bia')],
    myVoiceChannelId: 'sala'
  })
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bridge = { getSources: vi.fn(async () => SOURCES), select: vi.fn(async () => {}), canShareAudio: true }
  ;(window as unknown as { api: unknown }).api = { platform: 'win32', screen: bridge }
  vi.spyOn(voice, 'startScreenShare').mockResolvedValue()
  vi.spyOn(voice, 'attachScreen').mockReturnValue(() => {})
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.restoreAllMocks()
})

describe('ScreenPicker', () => {
  async function openPicker() {
    render(<ScreenPicker />)
    act(() => useApp.setState({ screenPickerOpen: true }))
    return screen.findByRole('listbox', { name: 'Telas' })
  }

  it('lista as telas, já com a primeira escolhida, e separa as janelas', async () => {
    const list = await openPicker()
    const options = within(list).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Tela 1', 'Tela 2'])
    expect(options[0].getAttribute('aria-selected')).toBe('true')

    await userEvent.click(screen.getByRole('button', { name: /Janelas/ }))
    const windows = screen.getByRole('listbox', { name: 'Janelas' })
    expect(within(windows).getAllByRole('option').map((o) => o.textContent)).toEqual(['Navegador'])
  })

  it('compartilha a fonte escolhida com o áudio marcado', async () => {
    const list = await openPicker()
    await userEvent.click(within(list).getByRole('option', { name: /Tela 2/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /áudio do computador/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Compartilhar' }))
    expect(bridge.select).toHaveBeenCalledWith('screen:1:0', true)
    expect(voice.startScreenShare).toHaveBeenCalledWith(true)
    await vi.waitFor(() => expect(useApp.getState().sharing).toBe(true))
    expect(useApp.getState().screenPickerOpen).toBe(false)
  })

  it('duplo clique compartilha direto', async () => {
    const list = await openPicker()
    await userEvent.dblClick(within(list).getByRole('option', { name: /Tela 1/ }))
    expect(bridge.select).toHaveBeenCalledWith('screen:0:0', false)
  })

  it('sem suporte a áudio do sistema, não mostra a opção', async () => {
    bridge.canShareAudio = false
    await openPicker()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('Cancelar fecha sem compartilhar', async () => {
    await openPicker()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(useApp.getState().screenPickerOpen).toBe(false)
    expect(voice.startScreenShare).not.toHaveBeenCalled()
  })

  it('erro ao listar aparece no seletor; Atualizar tenta de novo', async () => {
    bridge.getSources.mockRejectedValueOnce(new Error('Sem permissão de captura'))
    render(<ScreenPicker />)
    act(() => useApp.setState({ screenPickerOpen: true }))
    expect(await screen.findByText('Sem permissão de captura')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Compartilhar' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: /Atualizar/ }))
    expect(await screen.findByRole('listbox', { name: 'Telas' })).toBeTruthy()
  })

  it('sem janelas abertas, explica', async () => {
    bridge.getSources.mockResolvedValue(SOURCES.filter((s) => s.kind === 'screen'))
    await openPicker()
    await userEvent.click(screen.getByRole('button', { name: /Janelas/ }))
    expect(screen.getByText('Nenhuma janela aberta para compartilhar.')).toBeTruthy()
  })
})

describe('ScreenTile', () => {
  it('liga a tela da pessoa no <video> e desliga ao sair', () => {
    const detach = vi.fn()
    vi.mocked(voice.attachScreen).mockReturnValue(detach)
    const { unmount } = render(<ScreenTile userId="ana" featured />)
    const video = screen.getByLabelText('Tela de Ana')
    expect(voice.attachScreen).toHaveBeenCalledWith('ana', video)
    expect(screen.getByText('Ao vivo')).toBeTruthy()
    unmount()
    expect(detach).toHaveBeenCalled()
  })

  it('a própria tela aparece como "Sua tela"', () => {
    render(<ScreenTile userId="eu" featured />)
    expect(screen.getByText('Sua tela')).toBeTruthy()
  })
})

describe('VoiceGrid', () => {
  const members = [state('eu'), state('ana', { sharing: true }), state('bia', { sharing: true })]

  it('sem telas: só os participantes, com "ao vivo" em quem compartilha', () => {
    render(<VoiceGrid members={members} />)
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(screen.getAllByText('Ao vivo')).toHaveLength(2)
    expect(screen.queryByLabelText(/^Tela de/)).toBeNull()
  })

  it('com telas: a de outra pessoa em destaque, as outras em miniatura', async () => {
    useApp.setState({ screens: ['eu', 'ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    // Destaque = primeira tela que não é a própria.
    expect(screen.getByRole('button', { name: 'Tela cheia' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver a tela de Eu' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver a tela de Bia' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ver a tela de Ana' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Ver a tela de Bia' }))
    expect(screen.getByRole('button', { name: 'Ver a tela de Ana' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ver a tela de Bia' })).toBeNull()
  })

  it('se só a própria tela existe, ela fica em destaque', () => {
    useApp.setState({ screens: ['eu'] })
    render(<VoiceGrid members={members} />)
    expect(screen.getByText('Sua tela')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tela cheia' })).toBeTruthy()
  })

  it('a tela escolhida acabou: volta para outra', async () => {
    useApp.setState({ screens: ['ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver a tela de Bia' }))
    act(() => useApp.setState({ screens: ['ana'] }))
    expect(screen.queryByRole('button', { name: /Ver a tela de/ })).toBeNull()
    expect(screen.getByLabelText('Tela de Ana')).toBeTruthy()
  })
})
