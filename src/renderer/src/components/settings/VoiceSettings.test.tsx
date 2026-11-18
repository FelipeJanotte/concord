// @vitest-environment jsdom
// Configurações → "Voz e vídeo" (B4 e seguintes): dispositivos, volumes, ruído, sons e sobreposição.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User, VoiceState } from '@shared/types'
import { chimes } from '@/lib/actions/voice-sounds'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { VoiceSettings } from './VoiceSettings'

const user = (id: string, accountId: string, name: string): User => ({ id, accountId, name, tag: id, color: '#5865f2', avatarUrl: null })
const state = (userId: string, channelId = 'sala'): VoiceState => ({ userId, channelId, muted: false, deafened: false, sharing: false })

function device(deviceId: string, kind: MediaDeviceKind, label: string): MediaDeviceInfo {
  return { deviceId, kind, label, groupId: '' } as MediaDeviceInfo
}

const proto = HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }

beforeEach(() => {
  useApp.setState({
    ...initialState,
    self: user('eu', 'acc-eu', 'Eu'),
    users: [
      user('eu', 'acc-eu', 'Eu'),
      user('ana1', 'acc-ana', 'Ana'),
      user('ana2', 'acc-ana', 'Ana'), // a mesma conta em duas janelas
      user('bia', 'acc-bia', 'Bia'),
      user('caio', 'acc-caio', 'Caio')
    ],
    voice: [state('eu'), state('ana1'), state('ana2'), state('bia'), state('caio', 'outra-sala')],
    myVoiceChannelId: 'sala'
  })
  proto.setSinkId = () => {}
  vi.spyOn(voice, 'listDevices').mockImplementation(async (kind) =>
    kind === 'audioinput'
      ? [device('default', kind, 'Padrão'), device('mic-usb', kind, 'Headset USB'), device('mic-int', kind, 'Microfone interno')]
      : [device('fone', kind, 'Fone Bluetooth')]
  )
  vi.spyOn(voice, 'setInputDevice').mockResolvedValue()
  vi.spyOn(voice, 'setOutputDevice').mockResolvedValue()
})

afterEach(() => {
  cleanup()
  delete proto.setSinkId
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function openDialog(): Promise<void> {
  render(<VoiceSettings />)
  await screen.findByRole('option', { name: 'Headset USB' })
}

describe('VoiceSettings', () => {
  it('lista microfones e saídas, com "Padrão do sistema" selecionado', async () => {
    await openDialog()
    const mic = screen.getByLabelText('Microfone') as HTMLSelectElement
    expect([...mic.options].map((o) => o.text)).toEqual(['Padrão do sistema', 'Headset USB', 'Microfone interno'])
    expect(mic.value).toBe('__default__')
    const out = screen.getByLabelText('Saída de áudio') as HTMLSelectElement
    expect([...out.options].map((o) => o.text)).toEqual(['Padrão do sistema', 'Fone Bluetooth'])
  })

  it('escolher troca o dispositivo e lembra a escolha', async () => {
    await openDialog()
    await userEvent.selectOptions(screen.getByLabelText('Microfone'), 'Headset USB')
    expect(voice.setInputDevice).toHaveBeenCalledWith('mic-usb')
    expect(useApp.getState().audioInputId).toBe('mic-usb')
    await userEvent.selectOptions(screen.getByLabelText('Saída de áudio'), 'Fone Bluetooth')
    expect(voice.setOutputDevice).toHaveBeenCalledWith('fone')
    await userEvent.selectOptions(screen.getByLabelText('Microfone'), 'Padrão do sistema')
    expect(voice.setInputDevice).toHaveBeenLastCalledWith(null)
  })

  it('dispositivo salvo que foi desconectado aparece como tal', async () => {
    useApp.setState({ audioInputId: 'mic-sumiu' })
    await openDialog()
    const mic = screen.getByLabelText('Microfone') as HTMLSelectElement
    expect(mic.value).toBe('mic-sumiu')
    expect(screen.getByRole('option', { name: 'Dispositivo desconectado' })).toBeTruthy()
  })

  it('sem setSinkId, não oferece escolher a saída', async () => {
    delete proto.setSinkId
    await openDialog()
    expect(screen.queryByLabelText('Saída de áudio')).toBeNull()
  })

  it('sem permissão de microfone, explica por que os nomes não aparecem', async () => {
    vi.mocked(voice.listDevices).mockImplementation(async (kind) => [device('x1', kind, '')])
    render(<VoiceSettings />)
    expect(await screen.findByText(/nomes dos dispositivos aparecem depois/)).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Microfone 1' })).toBeTruthy()
  })

  it('o volume das pessoas não fica mais aqui: aponta para o botão direito', async () => {
    await openDialog()
    expect(screen.queryByRole('slider', { name: /^Volume de (Ana|Bia|Caio)/ })).toBeNull()
    expect(screen.getByText(/clique com o botão direito na pessoa/)).toBeTruthy()
  })

  it('volume do microfone (até 200%) e de saída (até 100%): ajusta na hora e volta para 100%', async () => {
    const mic = vi.spyOn(voice, 'setMicGain').mockResolvedValue()
    const out = vi.spyOn(voice, 'setOutputVolume').mockImplementation(() => {})
    await openDialog()
    const micSlider = screen.getByRole('slider', { name: 'Volume do microfone' }) as HTMLInputElement
    const outSlider = screen.getByRole('slider', { name: 'Volume de saída' }) as HTMLInputElement
    expect([micSlider.max, outSlider.max]).toEqual(['200', '100'])
    expect([micSlider.value, outSlider.value]).toEqual(['100', '100'])
    expect(screen.queryAllByRole('button', { name: 'Voltar para 100%' }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true)

    fireEvent.change(micSlider, { target: { value: '150' } })
    fireEvent.change(outSlider, { target: { value: '40' } })
    expect(useApp.getState()).toMatchObject({ micGain: 1.5, outputVolume: 0.4 })
    expect(mic).toHaveBeenLastCalledWith(1.5)
    expect(out).toHaveBeenLastCalledWith(0.4)
    expect(screen.getByText('150%')).toBeTruthy()
    expect(screen.getByText('40%')).toBeTruthy()

    const [resetMic] = screen.getAllByRole('button', { name: 'Voltar para 100%' })
    await userEvent.click(resetMic)
    expect(useApp.getState().micGain).toBe(1)
    expect(mic).toHaveBeenLastCalledWith(1)
  })

  it('volume de saída vale para o "Testar" dos sons da sala', async () => {
    const play = vi.spyOn(chimes, 'play').mockReturnValue(true)
    useApp.setState({ voiceSoundsVolume: 0.5, outputVolume: 0.5 })
    await openDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Testar' }))
    expect(play).toHaveBeenCalledWith('join', { volume: 0.25, outputId: null })
  })

  it('sons de entrar/sair: interruptor, volume e Testar', async () => {
    const play = vi.spyOn(chimes, 'play').mockReturnValue(true)
    await openDialog()
    const toggle = screen.getByRole('checkbox', { name: /som quando alguém entra ou sai/ }) as HTMLInputElement
    expect(toggle.checked).toBe(true)
    fireEvent.change(screen.getByRole('slider', { name: 'Volume dos sons de entrada e saída' }), { target: { value: '30' } })
    expect(useApp.getState().voiceSoundsVolume).toBe(0.3)
    expect(screen.getByText('30%')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Testar' }))
    expect(play).toHaveBeenCalledWith('join', { volume: 0.3, outputId: null })
    await userEvent.click(toggle)
    expect(useApp.getState().voiceSoundsEnabled).toBe(false)
    expect((screen.getByRole('slider', { name: 'Volume dos sons de entrada e saída' }) as HTMLInputElement).disabled).toBe(true)
  })

  it('supressão de ruído: interruptor e o que o filtro está fazendo agora', async () => {
    const apply = vi.spyOn(voice, 'setNoiseSuppression').mockResolvedValue()
    await openDialog()
    const toggle = screen.getByRole('checkbox', { name: 'Supressão de ruído automática' }) as HTMLInputElement
    expect(toggle.checked).toBe(true)
    expect(screen.getByText('Começa a funcionar quando você entrar numa sala de voz.')).toBeTruthy()
    act(() => useApp.setState({ noiseMode: 'advanced' }))
    expect(screen.getByText('Ruído detectado: filtro avançado ativo.')).toBeTruthy()
    act(() => useApp.setState({ noiseMode: 'light' }))
    expect(screen.getByText('Ambiente silencioso: usando o filtro leve.')).toBeTruthy()
    act(() => useApp.setState({ noiseMode: 'light-fallback' }))
    expect(screen.getByText(/indisponível neste computador/)).toBeTruthy()
    await userEvent.click(toggle)
    expect(apply).toHaveBeenCalledWith(false)
    expect(screen.getByText('Desligada: o microfone vai sem filtro.')).toBeTruthy()
  })
})

describe('sobreposição em jogos (B15)', () => {
  it('liga, escolhe canto e tamanho (desligado, os seletores ficam bloqueados) e explica o atalho', async () => {
    vi.stubGlobal('api', { overlay: { setEditing: vi.fn(), setConfig: vi.fn(), setRoom: vi.fn(), setShortcuts: vi.fn(async () => ({ toggle: true, edit: true })), pauseShortcuts: vi.fn() } })
    localStorage.clear()
    render(<VoiceSettings />)
    const corner = screen.getByLabelText('Posição do overlay') as HTMLSelectElement
    expect(corner.disabled).toBe(true)
    expect(screen.getByText(/Mostra só quem está falando na sua sala de voz e some enquanto o Concord está em foco/)).toBeTruthy()
    await userEvent.click(screen.getByLabelText('Mostrar quem está falando por cima dos jogos'))
    expect(useApp.getState().overlayEnabled).toBe(true)
    await userEvent.selectOptions(corner, 'bottom-right')
    await userEvent.selectOptions(screen.getByLabelText('Tamanho do overlay'), 'large')
    expect(useApp.getState()).toMatchObject({ overlayCorner: 'bottom-right', overlaySize: 'large' })
    expect(JSON.parse(localStorage.getItem('concord:overlay')!)).toMatchObject({ enabled: true, corner: 'bottom-right', size: 'large', position: null, width: null })
  })

  it("Mover: só no app, com o overlay ligado; vira Concluir no modo de mover; posição arrastada aparece no seletor", async () => {
    const setEditing = vi.fn()
    const w = window as unknown as { api?: unknown }
    w.api = { overlay: { setEditing, setConfig: vi.fn(), setRoom: vi.fn() } }
    try {
      useApp.setState({ overlayEnabled: false })
      render(<VoiceSettings />)
      const move = screen.getByRole("button", { name: "Mover" }) as HTMLButtonElement
      expect(move.disabled).toBe(true)
      act(() => useApp.setState({ overlayEnabled: true }))
      await userEvent.click(move)
      expect(setEditing).toHaveBeenLastCalledWith(true)
      act(() => useApp.setState({ overlayEditing: true, overlayPosition: { x: 300, y: 200 } }))
      expect(screen.getByText(/Arraste a sobreposição para onde quiser/)).toBeTruthy()
      await userEvent.click(screen.getByRole("button", { name: "Concluir" }))
      expect(setEditing).toHaveBeenLastCalledWith(false)
      const corner = screen.getByLabelText("Posição do overlay") as HTMLSelectElement
      expect(corner.value).toBe("__custom__")
      expect(screen.getByRole("option", { name: "Onde você arrastou" })).toBeTruthy()
      await userEvent.selectOptions(corner, "top-right")
      expect(useApp.getState()).toMatchObject({ overlayCorner: "top-right", overlayPosition: null })
    } finally {
      delete w.api
    }
  })

  it('fora do app (sem a ponte) não mostra a sobreposição', () => {
    useApp.setState({ overlayEnabled: true })
    render(<VoiceSettings />)
    expect(screen.queryByLabelText('Mostrar quem está falando por cima dos jogos')).toBeNull()
    expect(screen.queryByLabelText('Posição do overlay')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Mover' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restaurar padrão' })).toBeNull()
  })

  describe('atalhos', () => {
    function withBridge(run: (bridge: { setShortcuts: ReturnType<typeof vi.fn>; pauseShortcuts: ReturnType<typeof vi.fn> }) => Promise<void>) {
      const bridge = {
        setConfig: vi.fn(),
        setRoom: vi.fn(),
        setEditing: vi.fn(),
        setShortcuts: vi.fn(async () => ({ toggle: true, edit: true })),
        pauseShortcuts: vi.fn()
      }
      const w = window as unknown as { api?: unknown }
      w.api = { overlay: bridge }
      return run(bridge).finally(() => delete w.api)
    }

    it('mostra os atalhos atuais e grava uma combinação nova', () =>
      withBridge(async (bridge) => {
        localStorage.clear()
        useApp.setState({ overlayEnabled: true })
        render(<VoiceSettings />)
        expect(screen.getByLabelText('Atalho para ligar e desligar').textContent).toBe('Shift + `')
        expect(screen.getByLabelText('Atalho do modo de mover').textContent).toBe('Ctrl + Shift + `')
        await userEvent.click(screen.getByRole('button', { name: 'Trocar atalho para ligar e desligar' }))
        expect(bridge.pauseShortcuts).toHaveBeenLastCalledWith(true)
        expect(screen.getByText(/Pressione a nova combinação/)).toBeTruthy()
        fireEvent.keyDown(window, { key: 'O', code: 'KeyO', ctrlKey: true, altKey: true })
        expect(screen.getByLabelText('Atalho para ligar e desligar').textContent).toBe('Ctrl + Alt + O')
        expect(bridge.setShortcuts).toHaveBeenLastCalledWith({ toggle: 'Ctrl+Alt+O', edit: 'CommandOrControl+Shift+`' })
        expect(screen.queryByText(/Pressione a nova combinação/)).toBeNull()
        await userEvent.click(screen.getByRole('button', { name: 'Restaurar padrão' }))
        expect(screen.getByLabelText('Atalho para ligar e desligar').textContent).toBe('Shift + `')
      }))

    it('Esc desiste; fechar a tela no meio da gravação também', () =>
      withBridge(async (bridge) => {
        const { unmount } = render(<VoiceSettings />)
        await userEvent.click(screen.getByRole('button', { name: 'Trocar atalho do modo de mover' }))
        fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' })
        expect(useApp.getState().overlayRecording).toBeNull()
        expect(bridge.pauseShortcuts).toHaveBeenLastCalledWith(false)
        await userEvent.click(screen.getByRole('button', { name: 'Trocar atalho do modo de mover' }))
        unmount()
        expect(useApp.getState().overlayRecording).toBeNull()
        expect(bridge.pauseShortcuts.mock.calls).toEqual([[true], [false], [true], [false]])
      }))

    it('avisa quando outro programa já usa o atalho', () =>
      withBridge(async () => {
        useApp.setState({ overlayShortcutTaken: ['edit'] })
        render(<VoiceSettings />)
        expect(screen.getByText('Ctrl + Shift + ` já é usado por outro programa: escolha outro.')).toBeTruthy()
      }))
  })
})

describe('equalizador automático', () => {
  it('começa desligado; ligar avisa a voz e libera o volume-alvo', async () => {
    const on = vi.spyOn(voice, 'setLeveler').mockImplementation(() => {})
    const target = vi.spyOn(voice, 'setLevelerTarget').mockImplementation(() => {})
    await openDialog()
    const toggle = screen.getByRole('checkbox', { name: 'Equalizador automático' }) as HTMLInputElement
    const select = screen.getByLabelText('Volume-alvo do equalizador') as HTMLSelectElement
    expect(toggle.checked).toBe(false)
    expect(select.disabled).toBe(true)
    expect([...select.options].map((o) => o.text)).toEqual(['Baixo', 'Médio', 'Alto'])
    await userEvent.click(toggle)
    expect(on).toHaveBeenLastCalledWith(true)
    expect(select.disabled).toBe(false)
    await userEvent.selectOptions(select, 'Alto')
    expect(target).toHaveBeenLastCalledWith('high')
    expect(useApp.getState().voiceLevelerTarget).toBe('high')
  })
})
