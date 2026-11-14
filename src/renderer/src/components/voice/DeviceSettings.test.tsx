// @vitest-environment jsdom
// Diálogo "Configurações de voz" (B4): microfone e saída de áudio.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User, VoiceState } from '@shared/types'
import { chimes } from '@/lib/actions/voice-sounds'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { DeviceSettings } from './DeviceSettings'

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
})

async function openDialog(): Promise<void> {
  render(<DeviceSettings />)
  act(() => useApp.setState({ deviceSettingsOpen: true }))
  await screen.findByRole('option', { name: 'Headset USB' })
}

describe('DeviceSettings', () => {
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
    render(<DeviceSettings />)
    act(() => useApp.setState({ deviceSettingsOpen: true }))
    expect(await screen.findByText(/nomes dos dispositivos aparecem depois/)).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Microfone 1' })).toBeTruthy()
  })

  it('o volume das pessoas não fica mais aqui: aponta para o botão direito', async () => {
    await openDialog()
    expect(screen.queryByRole('slider', { name: /^Volume de / })).toBeNull()
    expect(screen.getByText(/clique com o botão direito na pessoa/)).toBeTruthy()
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
