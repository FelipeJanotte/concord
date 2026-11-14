// Ações de compartilhar a tela (lib/actions/voice.ts) com socket falso e VoiceClient espionado.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScreenShareBridge } from '@shared/screen'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { canShareSystemAudio, closeScreenPicker, leaveVoice, startScreenShare, stopScreenShare, toggleScreenShare } from './voice'

let socket: FakeSocket
let bridge: ScreenShareBridge & { select: ReturnType<typeof vi.fn> }

function inVoice(): void {
  useApp.setState({ myVoiceChannelId: 'sala' })
}

beforeEach(() => {
  useApp.setState({ ...initialState })
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bridge = { getSources: vi.fn(async () => []), select: vi.fn(async () => {}), canShareAudio: true }
  vi.stubGlobal('window', { api: { screen: bridge } })
  vi.spyOn(voice, 'startScreenShare').mockResolvedValue()
  vi.spyOn(voice, 'stopScreenShare').mockResolvedValue()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  setSocket(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('toggleScreenShare', () => {
  it('fora da sala de voz só avisa', () => {
    toggleScreenShare()
    expect(useApp.getState().screenPickerOpen).toBe(false)
    expect(useApp.getState().notice?.text).toContain('Entre numa sala de voz')
  })

  it('no Electron abre o seletor', () => {
    inVoice()
    toggleScreenShare()
    expect(useApp.getState().screenPickerOpen).toBe(true)
    closeScreenPicker()
    expect(useApp.getState().screenPickerOpen).toBe(false)
  })

  it('no navegador (sem window.api) deixa o navegador perguntar', async () => {
    vi.stubGlobal('window', {})
    inVoice()
    toggleScreenShare()
    await vi.waitFor(() => expect(voice.startScreenShare).toHaveBeenCalledWith(false))
    expect(useApp.getState().screenPickerOpen).toBe(false)
  })

  it('compartilhando, para', async () => {
    inVoice()
    useApp.setState({ sharing: true })
    toggleScreenShare()
    await vi.waitFor(() => expect(useApp.getState().sharing).toBe(false))
    expect(voice.stopScreenShare).toHaveBeenCalled()
  })
})

describe('startScreenShare', () => {
  it('escolhe a fonte no Electron, publica e avisa o servidor', async () => {
    inVoice()
    useApp.setState({ screenPickerOpen: true })
    await startScreenShare('screen:0:0', true)
    expect(bridge.select).toHaveBeenCalledWith('screen:0:0', true)
    expect(voice.startScreenShare).toHaveBeenCalledWith(true)
    expect(useApp.getState()).toMatchObject({ sharing: true, screenPickerOpen: false })
    expect(socket.sent('voice:sharing')).toEqual([[true]])
  })

  it('não pede áudio onde o sistema não suporta', async () => {
    bridge.canShareAudio = false
    inVoice()
    expect(canShareSystemAudio()).toBe(false)
    await startScreenShare('screen:0:0', true)
    expect(bridge.select).toHaveBeenCalledWith('screen:0:0', false)
  })

  it('cancelar o seletor do navegador não mostra erro', async () => {
    inVoice()
    vi.mocked(voice.startScreenShare).mockRejectedValue(new DOMException('cancelado', 'NotAllowedError'))
    await startScreenShare(null, false)
    expect(useApp.getState().notice).toBeNull()
    expect(useApp.getState().sharing).toBe(false)
    expect(socket.sent('voice:sharing')).toEqual([])
  })

  it('outros erros viram aviso e não marcam "ao vivo"', async () => {
    inVoice()
    bridge.select.mockRejectedValue(new Error('Essa tela ou janela não está mais disponível.'))
    await startScreenShare('window:1:0', false)
    expect(useApp.getState().notice?.text).toContain('Não foi possível compartilhar a tela')
    expect(useApp.getState().sharing).toBe(false)
    expect(voice.startScreenShare).not.toHaveBeenCalled()
  })
})

describe('parar e sair', () => {
  it('stopScreenShare avisa o servidor uma vez, mesmo se o LiveKit também avisar', async () => {
    inVoice()
    useApp.setState({ sharing: true })
    await stopScreenShare()
    voice.onScreenShareEnded?.() // o LocalTrackUnpublished chega logo depois
    expect(socket.sent('voice:sharing')).toEqual([[false]])
  })

  it('a tela parou pelo sistema: desliga o "ao vivo"', () => {
    inVoice()
    useApp.setState({ sharing: true })
    voice.onScreenShareEnded?.()
    expect(useApp.getState().sharing).toBe(false)
    expect(socket.sent('voice:sharing')).toEqual([[false]])
  })

  it('sair da sala zera tela e seletor', () => {
    vi.spyOn(voice, 'leave').mockImplementation(() => {})
    inVoice()
    useApp.setState({ sharing: true, screenPickerOpen: true })
    leaveVoice()
    expect(useApp.getState()).toMatchObject({ myVoiceChannelId: null, sharing: false, screenPickerOpen: false })
  })
})
