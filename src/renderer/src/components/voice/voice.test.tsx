// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScreenShareBridge, ScreenShareStart, ScreenSource } from '@shared/screen'
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
  { id: 'screen:1:0', name: 'Tela 2', kind: 'screen', thumbnail: 'data:image/png;base64,Mg==', appIcon: null },
  { id: 'window:7:0', name: 'Navegador', kind: 'window', thumbnail: 'data:image/png;base64,AA==', appIcon: 'data:image/png;base64,AA==' }
]

let bridge: ScreenShareBridge & { getSources: ReturnType<typeof vi.fn>; sharing: ScreenShareStart | null }
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
  bridge = {
    getSources: vi.fn(async () => SOURCES),
    sharing: null,
    start: async (request) => {
      bridge.sharing = request
    },
    stop: async () => {
      bridge.sharing = null
    },
    onEnded: () => () => {},
    preview: async () => 'data:image/png;base64,AA==',
    canShareAudio: true
  }
  socket.replyTo('voice:screen-credentials', () => ({ ok: true, url: 'ws://livekit.test', token: 'jwt-tela' }))
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
    await vi.waitFor(() => expect(useApp.getState().sharing).toBe(true))
    expect(bridge.sharing).toEqual({ sourceId: 'screen:1:0', audio: true, url: 'ws://livekit.test', token: 'jwt-tela' })
    expect(useApp.getState()).toMatchObject({ screenPickerOpen: false, ownScreenThumbnail: 'data:image/png;base64,Mg==' })
  })

  it('duplo clique compartilha direto', async () => {
    const list = await openPicker()
    await userEvent.dblClick(within(list).getByRole('option', { name: /Tela 1/ }))
    await vi.waitFor(() => expect(bridge.sharing).toMatchObject({ sourceId: 'screen:0:0', audio: false }))
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
    expect(bridge.sharing).toBeNull()
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

  it('a própria tela nativa mostra a miniatura da fonte e "Você está compartilhando", sem vídeo', () => {
    useApp.setState({ ownScreenThumbnail: 'data:image/png;base64,Mg==' })
    render(<ScreenTile userId="eu" onSelect={() => {}} />)
    const card = screen.getByRole('img', { name: 'Sua tela' })
    expect(card.getAttribute('src')).toBe('data:image/png;base64,Mg==')
    expect(screen.getByText('Você está compartilhando')).toBeTruthy()
    expect(document.querySelector('video')).toBeNull()
    expect(voice.attachScreen).not.toHaveBeenCalled()
  })

  it('a tela de outra pessoa continua ao vivo enquanto eu compartilho pela tela nativa', () => {
    useApp.setState({ ownScreenThumbnail: 'data:image/png;base64,Mg==' })
    render(<ScreenTile userId="ana" onSelect={() => {}} />)
    expect(voice.attachScreen).toHaveBeenCalledWith('ana', screen.getByLabelText('Tela de Ana'))
    expect(screen.queryByText('Você está compartilhando')).toBeNull()
  })
})

describe('VoiceGrid', () => {
  const members = [state('eu'), state('ana', { sharing: true }), state('bia', { sharing: true })]
  const stageLabel = (): string | null => screen.getByText(/^Assistindo:/).textContent
  const card = (name: string): HTMLElement => screen.getByRole('button', { name: `Assistir: ${name}` })
  const watchSent = (): unknown[][] => socket.sent('voice:watching')
  const serverKnows = (watching: string[]): void => act(() => useApp.setState({ voice: [state('eu', { watching })] }))

  it('sem telas: só os participantes, com "ao vivo" em quem compartilha (sem "Assistir": a tela ainda não chegou)', () => {
    render(<VoiceGrid members={members} />)
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(screen.getAllByText('Ao vivo')).toHaveLength(2)
    expect(screen.queryByLabelText(/^Tela de/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Assistir/ })).toBeNull()
  })

  it('com telas: ninguém entra assistindo; as telas aparecem como cards na grade e nada vai para o servidor', () => {
    useApp.setState({ screens: ['eu', 'ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    expect(screen.queryByText(/^Assistindo:/)).toBeNull()
    expect(card('Tela de Ana')).toBeTruthy()
    expect(card('Tela de Bia')).toBeTruthy()
    expect(card('Sua tela')).toBeTruthy()
    expect(watchSent()).toEqual([])
  })

  it('clicar no card assiste: a tela vai para o destaque, com o seletor e a tela cheia, e o servidor fica sabendo', async () => {
    useApp.setState({ screens: ['eu', 'ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(card('Tela de Ana'))
    expect(stageLabel()).toBe('Assistindo: Tela de Ana')
    expect(watchSent()).toEqual([[['ana']]])
    const chips = within(screen.getByRole('group', { name: 'Telas ao vivo' })).getAllByRole('button')
    expect(chips.map((c) => [c.textContent, c.getAttribute('aria-pressed')])).toEqual([
      ['Sua tela', 'false'],
      ['Tela de Ana', 'true'],
      ['Tela de Bia', 'false']
    ])
    expect(screen.getByRole('button', { name: 'Tela cheia' })).toBeTruthy()

    await userEvent.click(chip('Tela de Bia'))
    expect(stageLabel()).toBe('Assistindo: Tela de Ana e Tela de Bia')
    expect(watchSent()).toEqual([[['ana']], [['ana', 'bia']]])
    await userEvent.click(chip('Tela de Ana'))
    expect(stageLabel()).toBe('Assistindo: Tela de Bia')
    await userEvent.click(screen.getByRole('button', { name: 'Assistir a tela de Ana' }))
    expect(stageLabel()).toBe('Assistindo: Tela de Ana')
    expect(screen.queryByRole('button', { name: 'Assistir a tela de Ana' })).toBeNull()
  })

  it('a própria tela abre como prévia, sem contar como espectador', async () => {
    useApp.setState({ screens: ['eu'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(card('Sua tela'))
    expect(stageLabel()).toBe('Assistindo: Sua tela')
    expect(screen.queryByRole('group', { name: 'Telas ao vivo' })).toBeNull()
    expect(watchSent()).toEqual([])
  })

  it('"Parar de assistir" volta para a grade com os cards e avisa o servidor', async () => {
    useApp.setState({ screens: ['ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(card('Tela de Ana'))
    serverKnows(['ana'])
    await userEvent.click(screen.getByRole('button', { name: 'Parar de assistir' }))
    expect(screen.queryByText(/^Assistindo:/)).toBeNull()
    expect(card('Tela de Ana')).toBeTruthy()
    expect(watchSent()).toEqual([[['ana']], [[]]])
  })

  it('tirar a última tela do destaque pelo seletor também para de assistir', async () => {
    useApp.setState({ screens: ['ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(card('Tela de Ana'))
    await userEvent.click(chip('Tela de Ana'))
    expect(screen.queryByText(/^Assistindo:/)).toBeNull()
  })

  it('sair da tela da sala deixa de contar como espectador', async () => {
    useApp.setState({ screens: ['ana'] })
    const { unmount } = render(<VoiceGrid members={members} />)
    await userEvent.click(card('Tela de Ana'))
    serverKnows(['ana'])
    unmount()
    expect(watchSent()).toEqual([[['ana']], [[]]])
  })

  const panes = (): string[] => [...document.querySelectorAll<HTMLElement>('[data-screen-pane]')].map((el) => el.dataset.screenPane ?? '')
  const chip = (name: string): HTMLElement => within(screen.getByRole('group', { name: 'Telas ao vivo' })).getByRole('button', { name })

  it('duas telas em destaque ao mesmo tempo, cada uma com o seu vídeo', async () => {
    useApp.setState({ screens: ['eu', 'ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(card('Tela de Ana'))
    expect(panes()).toEqual(['ana'])
    await userEvent.click(chip('Tela de Bia'))
    expect(panes()).toEqual(['ana', 'bia'])
    expect(chip('Tela de Bia').getAttribute('aria-pressed')).toBe('true')
    const row = screen.getByRole('group', { name: 'Membros da chamada' })
    expect(within(row).queryByRole('button', { name: 'Assistir: Tela de Bia' })).toBeNull()
    expect(within(row).getByRole('button', { name: 'Assistir: Sua tela' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Assistir a tela de Bia' })).toBeNull()

    await userEvent.click(chip('Tela de Ana'))
    expect(panes()).toEqual(['bia'])
  })

  it('clicar numa miniatura assiste só aquela tela', async () => {
    useApp.setState({ screens: ['eu', 'ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(card('Tela de Ana'))
    await userEvent.click(chip('Tela de Bia'))
    await userEvent.click(card('Sua tela'))
    expect(panes()).toEqual(['eu'])
  })

  it('arrastar uma tela sobre outra troca a ordem', async () => {
    useApp.setState({ screens: ['eu', 'ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(card('Tela de Ana'))
    await userEvent.click(chip('Tela de Bia'))
    await userEvent.click(chip('Sua tela'))
    expect(panes()).toEqual(['ana', 'bia', 'eu'])
    const pane = (id: string): HTMLElement => document.querySelector<HTMLElement>(`[data-screen-pane="${id}"]`)!
    expect(pane('ana').draggable).toBe(true)
    fireEvent.dragStart(pane('eu'))
    fireEvent.dragOver(pane('ana'))
    fireEvent.drop(pane('ana'))
    expect(panes()).toEqual(['eu', 'ana', 'bia'])
    expect(stageLabel()).toBe('Assistindo: Sua tela, Tela de Ana e Tela de Bia')
  })

  it('lado a lado ou empilhadas; com uma tela só, sem o botão', async () => {
    useApp.setState({ screens: ['ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(card('Tela de Ana'))
    expect(screen.queryByRole('button', { name: 'Empilhar as telas' })).toBeNull()
    await userEvent.click(chip('Tela de Bia'))
    const arrangement = (): string | undefined => document.querySelector<HTMLElement>('[data-arrangement]')?.dataset.arrangement
    expect(arrangement()).toBe('side-by-side')
    await userEvent.click(screen.getByRole('button', { name: 'Empilhar as telas' }))
    expect(arrangement()).toBe('stacked')
    await userEvent.click(screen.getByRole('button', { name: 'Pôr as telas lado a lado' }))
    expect(arrangement()).toBe('side-by-side')
  })

  it('uma das telas em destaque acabou: as outras continuam', async () => {
    useApp.setState({ screens: ['ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(card('Tela de Ana'))
    await userEvent.click(chip('Tela de Bia'))
    act(() => useApp.setState({ screens: ['bia'] }))
    expect(panes()).toEqual(['bia'])
  })

  it('a tela que eu assisto acabou: volta para a grade, e se ela voltar não entro assistindo sozinho', async () => {
    useApp.setState({ screens: ['ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(card('Tela de Bia'))
    serverKnows(['bia'])
    act(() => useApp.setState({ screens: ['ana'] }))
    expect(screen.queryByText(/^Assistindo:/)).toBeNull()
    expect(watchSent()).toEqual([[['bia']], [[]]])
    act(() => useApp.setState({ screens: ['ana', 'bia'] }))
    expect(screen.queryByText(/^Assistindo:/)).toBeNull()
  })

  it('minha tela em destaque: a barra mostra quem está assistindo; a tela dos outros não mostra', async () => {
    useApp.setState({
      screens: ['eu', 'ana'],
      voice: [state('eu'), state('ana', { watching: ['eu'] }), state('bia', { watching: ['eu', 'ana'] })]
    })
    render(<VoiceGrid members={members} />)
    await userEvent.click(card('Sua tela'))
    expect(screen.getByText('Assistindo: Ana e Bia')).toBeTruthy()
    await userEvent.click(card('Tela de Ana'))
    expect(screen.queryByText('Assistindo: Ana e Bia')).toBeNull()
    expect(screen.queryByText('Assistindo: Bia')).toBeNull()
    await userEvent.click(chip('Sua tela'))
    act(() => useApp.setState({ voice: [state('eu'), state('ana'), state('bia')] }))
    expect(screen.getByText('Ninguém assistindo')).toBeTruthy()
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
      await userEvent.click(card('Tela de Ana'))
      await userEvent.click(screen.getByRole('button', { name: 'Tela cheia' }))
      expect(request).toHaveBeenCalledTimes(1)
      const stage = request.mock.contexts[0] as HTMLElement
      expect(stage.contains(screen.getByText(/^Assistindo:/))).toBe(true)
      expect(stage.dataset.fullscreen).toBe('true')
      expect(screen.queryByRole('button', { name: 'Parar de assistir' })).toBeNull()
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
    await userEvent.click(card('Tela de Ana'))
    const row = screen.getByRole('group', { name: 'Membros da chamada' })
    expect(within(row).getByText('Bia')).toBeTruthy()
    expect(within(row).getByRole('button', { name: 'Assistir: Tela de Bia' })).toBeTruthy()
    expect(row.className).toContain('[&>*:first-child]:ml-auto')
    expect(row.className).toContain('[&>*:last-child]:mr-auto')

    const hide = screen.getByRole('button', { name: 'Esconder membros' })
    expect(hide.getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(hide)
    expect(screen.queryByRole('group', { name: 'Membros da chamada' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Assistir: Tela de Bia' })).toBeNull()
    expect(stageLabel()).toBe('Assistindo: Tela de Ana')

    const show = screen.getByRole('button', { name: 'Mostrar membros' })
    expect(show.getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(show)
    expect(within(screen.getByRole('group', { name: 'Membros da chamada' })).getByText('Bia')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Esconder membros' })).toBeTruthy()
  })

  it('"Parar de assistir" não depende da fileira escondida: a grade mostra todos', async () => {
    useApp.setState({ screens: ['ana'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(card('Tela de Ana'))
    await userEvent.click(screen.getByRole('button', { name: 'Esconder membros' }))
    await userEvent.click(screen.getByRole('button', { name: 'Parar de assistir' }))
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
    await userEvent.click(card('Tela de Ana'))
    await userEvent.click(screen.getByRole('button', { name: 'Tela cheia' }))
    expect(useApp.getState().notice?.text).toBe('Não foi possível abrir em tela cheia.')
  })
})

describe('grade centralizada com tamanho automático', () => {
  function withArea(width: number, height: number): () => void {
    const observers: Array<() => void> = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          observers.push(cb)
        }
        observe(): void {}
        disconnect(): void {}
      }
    )
    const w = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)
    const h = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height)
    return () => {
      w.mockRestore()
      h.mockRestore()
      vi.unstubAllGlobals()
    }
  }
  const grid = (): HTMLElement => screen.getByText('Ana').closest('[data-tile-grid]') as HTMLElement

  it('centraliza e calcula o tamanho dos quadros pelo espaço: 2 pessoas numa área larga = lado a lado, grandes', () => {
    const restore = withArea(1200, 500)
    try {
      render(<VoiceGrid members={[state('eu'), state('ana')]} />)
      const el = grid()
      expect(el.dataset.columns).toBe('2')
      expect(el.style.getPropertyValue('--tile-w')).toBe('592px')
      expect(el.className).toContain('justify-center')
      expect(el.className).toContain('[align-content:safe_center]')
    } finally {
      restore()
    }
  })

  it('no painel da chamada (sem altura definida) os quadros ficam lado a lado até o tamanho máximo', () => {
    const restore = withArea(1000, 0)
    try {
      render(<VoiceGrid members={[state('eu'), state('ana')]} fill={false} />)
      expect(grid().dataset.columns).toBe('2')
      expect(grid().style.getPropertyValue('--tile-w')).toBe('320px')
    } finally {
      restore()
    }
  })

  it('antes de medir (ou sem ResizeObserver) usa um tamanho padrão, sem quebrar', () => {
    render(<VoiceGrid members={[state('eu'), state('ana')]} />)
    expect(grid().dataset.columns).toBeUndefined()
    expect(grid().className).toContain('[&>*]:w-[var(--tile-w,240px)]')
  })
})

describe('áudio da tela em destaque', () => {
  const members = [state('eu', { sharing: true }), state('ana', { sharing: true }), state('bia', { sharing: true })]

  beforeEach(() => {
    vi.spyOn(voice, 'setScreenVolume').mockImplementation(() => {})
    vi.spyOn(voice, 'setScreenMuted').mockImplementation(() => {})
  })

  it('tela com áudio mostra silenciar e volume; regular e silenciar valem só para a tela daquela pessoa', async () => {
    useApp.setState({ screens: ['ana'], screenAudio: ['ana'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(screen.getByRole('button', { name: 'Assistir: Tela de Ana' }))
    const slider = screen.getByRole('slider', { name: 'Volume da tela de Ana' }) as HTMLInputElement
    expect(slider.value).toBe('100')

    fireEvent.change(slider, { target: { value: '35' } })
    expect(useApp.getState().screenVolumes).toEqual({ 'acc-ana': 0.35 })
    expect(voice.setScreenVolume).toHaveBeenLastCalledWith('acc-ana', 0.35)

    await userEvent.click(screen.getByRole('button', { name: 'Silenciar a tela de Ana' }))
    expect(useApp.getState().screenMuted).toEqual({ 'acc-ana': true })
    expect(useApp.getState().userMuted).toEqual({})
    expect(voice.setScreenMuted).toHaveBeenLastCalledWith('acc-ana', true)

    await userEvent.click(screen.getByRole('button', { name: 'Ativar o som da tela de Ana' }))
    expect(useApp.getState().screenMuted).toEqual({})
  })

  it('tela sem áudio e a minha própria tela não têm controle de áudio', async () => {
    useApp.setState({ screens: ['eu', 'ana', 'bia'], screenAudio: ['eu', 'bia'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(screen.getByRole('button', { name: 'Assistir: Tela de Ana' }))
    expect(screen.getByText(/^Assistindo:/).textContent).toBe('Assistindo: Tela de Ana')
    expect(screen.queryByRole('slider', { name: /Volume da tela/ })).toBeNull()

    await userEvent.click(within(screen.getByRole('group', { name: 'Telas ao vivo' })).getByRole('button', { name: 'Sua tela' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Telas ao vivo' })).getByRole('button', { name: 'Tela de Ana' }))
    expect(screen.getByText(/^Assistindo:/).textContent).toBe('Assistindo: Sua tela')
    expect(screen.queryByRole('slider', { name: /Volume da tela/ })).toBeNull()
  })

  it('duas telas em destaque com áudio: um controle para cada uma', async () => {
    useApp.setState({ screens: ['ana', 'bia'], screenAudio: ['ana', 'bia'] })
    render(<VoiceGrid members={members} />)
    await userEvent.click(screen.getByRole('button', { name: 'Assistir: Tela de Ana' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Telas ao vivo' })).getByRole('button', { name: 'Tela de Bia' }))
    expect(screen.getByRole('slider', { name: 'Volume da tela de Ana' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Volume da tela de Bia' })).toBeTruthy()
  })
})
