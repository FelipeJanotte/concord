// @vitest-environment jsdom
// Componentes da tela compartilhada: seletor, miniatura/destaque da tela (escolher qual ver, grade, tela cheia) e grade da sala.
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
import { featuredScreen, VoiceGrid } from './VoiceGrid'

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
  it('liga a tela da pessoa no <video>, desliga ao sair e clicar assiste', async () => {
    const detach = vi.fn()
    vi.mocked(voice.attachScreen).mockReturnValue(detach)
    const onSelect = vi.fn()
    const { unmount } = render(<ScreenTile userId="ana" onSelect={onSelect} />)
    const video = screen.getByLabelText('Tela de Ana')
    expect(voice.attachScreen).toHaveBeenCalledWith('ana', video)
    expect(screen.getByText('Ao vivo')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Assistir: Tela de Ana' }))
    expect(onSelect).toHaveBeenCalled()
    unmount()
    expect(detach).toHaveBeenCalled()
  })

  it('a própria tela aparece como "Sua tela"', () => {
    render(<ScreenTile userId="eu" onSelect={() => {}} />)
    expect(screen.getByText('Sua tela')).toBeTruthy()
  })
})

describe('featuredScreen', () => {
  it('escolhida se ainda ao vivo; senão a primeira de outra pessoa; a própria só sozinha; grade = nenhuma', () => {
    expect(featuredScreen([], 'eu', null, false)).toBeNull()
    expect(featuredScreen(['eu', 'ana', 'bia'], 'eu', null, false)).toBe('ana')
    expect(featuredScreen(['eu', 'ana', 'bia'], 'eu', 'bia', false)).toBe('bia')
    expect(featuredScreen(['eu', 'ana'], 'eu', 'bia', false)).toBe('ana') // a escolhida acabou
    expect(featuredScreen(['eu'], 'eu', null, false)).toBe('eu')
    expect(featuredScreen(['ana'], 'eu', 'ana', true)).toBeNull()
  })
})

describe('VoiceGrid', () => {
  const members = [state('eu'), state('ana', { sharing: true }), state('bia', { sharing: true })]
  const stageLabel = (): string | null => screen.getByText(/^Assistindo:/).textContent

  it('sem telas: só os participantes, com "ao vivo" em quem compartilha (sem "Assistir": a tela ainda não chegou)', () => {
    render(<VoiceGrid members={members} />)
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(screen.getAllByText('Ao vivo')).toHaveLength(2)
    expect(screen.queryByLabelText(/^Tela de/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Assistir/ })).toBeNull()
  })

  it('com telas: a de outra pessoa em destaque, com "Assistindo", o seletor das telas ao vivo e a tela cheia sempre à vista', async () => {
    useApp.setState({ screens: ['eu', 'ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    expect(stageLabel()).toBe('Assistindo: Tela de Ana')
    const chips = within(screen.getByRole('group', { name: 'Telas ao vivo' })).getAllByRole('button')
    expect(chips.map((c) => [c.textContent, c.getAttribute('aria-pressed')])).toEqual([
      ['Sua tela', 'false'],
      ['Tela de Ana', 'true'],
      ['Tela de Bia', 'false']
    ])
    expect(screen.getByRole('button', { name: 'Tela cheia' })).toBeTruthy()

    // pelo seletor
    await userEvent.click(within(screen.getByRole('group', { name: 'Telas ao vivo' })).getByRole('button', { name: 'Tela de Bia' }))
    expect(stageLabel()).toBe('Assistindo: Tela de Bia')
    // pela miniatura
    await userEvent.click(screen.getByRole('button', { name: 'Assistir: Sua tela' }))
    expect(stageLabel()).toBe('Assistindo: Sua tela')
    // pelo "Ao vivo" de quem compartilha
    await userEvent.click(screen.getByRole('button', { name: 'Assistir a tela de Ana' }))
    expect(stageLabel()).toBe('Assistindo: Tela de Ana')
    expect(screen.queryByRole('button', { name: 'Assistir a tela de Ana' })).toBeNull() // já está assistindo
  })

  it('uma tela só: sem seletor', () => {
    useApp.setState({ screens: ['eu'] })
    render(<VoiceGrid members={members} />)
    expect(stageLabel()).toBe('Assistindo: Sua tela')
    expect(screen.queryByRole('group', { name: 'Telas ao vivo' })).toBeNull()
  })

  it('"Ver grade" mostra todas as telas lado a lado; clicar numa volta ao destaque', async () => {
    useApp.setState({ screens: ['ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver grade' }))
    expect(screen.queryByText(/^Assistindo:/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Assistir: Tela de Ana' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Assistir: Tela de Bia' }))
    expect(stageLabel()).toBe('Assistindo: Tela de Bia')
  })

  it('a tela escolhida acabou: volta para outra', async () => {
    useApp.setState({ screens: ['ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(screen.getByRole('button', { name: 'Assistir: Tela de Bia' }))
    act(() => useApp.setState({ screens: ['ana'] }))
    expect(stageLabel()).toBe('Assistindo: Tela de Ana')
  })

  it('tela cheia: põe o quadro inteiro (com a barra) em tela cheia; o botão e o duplo clique alternam', async () => {
    useApp.setState({ screens: ['ana'] })
    let fullscreen: Element | null = null
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen })
    const request = vi.fn(async function (this: Element) {
      fullscreen = this
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    const exit = vi.fn(async () => {
      fullscreen = null
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    Element.prototype.requestFullscreen = request as never
    document.exitFullscreen = exit
    try {
      render(<VoiceGrid members={members} />)
      await userEvent.click(screen.getByRole('button', { name: 'Tela cheia' }))
      expect(request).toHaveBeenCalledTimes(1)
      const stage = request.mock.contexts[0] as HTMLElement
      expect(stage.contains(screen.getByText(/^Assistindo:/))).toBe(true) // a barra vai junto
      expect(stage.dataset.fullscreen).toBe('true')
      expect(screen.queryByRole('button', { name: 'Ver grade' })).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: 'Sair da tela cheia' }))
      expect(exit).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: 'Tela cheia' })).toBeTruthy()
      await userEvent.dblClick(screen.getByLabelText('Tela de Ana'))
      expect(request).toHaveBeenCalledTimes(2)
    } finally {
      delete (document as unknown as Record<string, unknown>).fullscreenElement
    }
  })

  it('"Esconder membros" tira a fileira de membros de baixo; "Mostrar membros" traz de volta', async () => {
    useApp.setState({ screens: ['ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    const row = screen.getByRole('group', { name: 'Membros da chamada' })
    expect(within(row).getByText('Bia')).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Assistir: Tela de Bia' })).toBeTruthy()
    // centralizada (margens automáticas nas pontas)
    expect(row.className).toContain('[&>*:first-child]:ml-auto')
    expect(row.className).toContain('[&>*:last-child]:mr-auto')

    const hide = screen.getByRole('button', { name: 'Esconder membros' })
    expect(hide.getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(hide)
    expect(screen.queryByRole('group', { name: 'Membros da chamada' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Assistir: Tela de Bia' })).toBeNull()
    expect(stageLabel()).toBe('Assistindo: Tela de Ana') // o destaque continua

    const show = screen.getByRole('button', { name: 'Mostrar membros' })
    expect(show.getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(show)
    expect(within(screen.getByRole('group', { name: 'Membros da chamada' })).getByText('Bia')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Esconder membros' })).toBeTruthy()
  })

  it('"Ver grade" não depende da fileira escondida: a grade mostra todos', async () => {
    useApp.setState({ screens: ['ana'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(screen.getByRole('button', { name: 'Esconder membros' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ver grade' }))
    expect(screen.getByText('Bia')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /membros/ })).toBeNull()
  })

  it('tela cheia recusada pelo sistema vira aviso', async () => {
    useApp.setState({ screens: ['ana'] })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    Element.prototype.requestFullscreen = vi.fn(async () => {
      throw new TypeError('Permissions check failed')
    }) as never
    render(<VoiceGrid members={members} />)
    await userEvent.click(screen.getByRole('button', { name: 'Tela cheia' }))
    expect(useApp.getState().notice?.text).toBe('Não foi possível abrir em tela cheia.')
  })
})
