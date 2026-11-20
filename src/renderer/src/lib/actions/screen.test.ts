import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScreenShareBridge, ScreenShareEndReason, ScreenShareStart, ScreenSource } from '@shared/screen'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { canShareSystemAudio, closeScreenPicker, leaveVoice, startBrowserScreenShare, startNativeScreenShare, stopScreenShare, toggleScreenShare } from './voice'

class FakeScreenBridge implements ScreenShareBridge {
  canShareAudio = true
  sharing: ScreenShareStart | null = null
  startFailure: Error | null = null
  stopFailure: Error | null = null
  endDuringStart: ScreenShareEndReason | null = null
  private endListeners = new Set<(reason: ScreenShareEndReason) => void>()

  getSources = async (): Promise<ScreenSource[]> => []

  start = async (request: ScreenShareStart): Promise<void> => {
    if (this.startFailure) throw this.startFailure
    this.sharing = request
    if (this.endDuringStart) this.end(this.endDuringStart)
  }

  preview = async (): Promise<string> => 'data:image/png;base64,AAAA'

  stop = async (): Promise<void> => {
    if (this.stopFailure) throw this.stopFailure
    this.sharing = null
  }

  onEnded = (listener: (reason: ScreenShareEndReason) => void): (() => void) => {
    this.endListeners.add(listener)
    return () => this.endListeners.delete(listener)
  }

  end(reason: ScreenShareEndReason): void {
    this.sharing = null
    for (const listener of this.endListeners) listener(reason)
  }
}

const SOURCE: ScreenSource = { id: 'screen:65537', name: 'Tela 1', kind: 'screen', thumbnail: 'data:image/png;base64,AAAA', appIcon: null }

let socket: FakeSocket
let bridge: FakeScreenBridge

function inVoice(): void {
  useApp.setState({ myVoiceChannelId: 'sala', self: { id: 'eu', accountId: 'conta', name: 'Eu', tag: 'eu', color: '#000', avatarUrl: null } })
}

function grantCredentials(): void {
  socket.replyTo('voice:screen-credentials', () => ({ ok: true, url: 'ws://livekit.test', token: 'jwt-tela' }))
}

beforeEach(() => {
  useApp.setState({ ...initialState })
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bridge = new FakeScreenBridge()
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

  it('no app desktop abre o seletor', () => {
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
    await vi.waitFor(() => expect(voice.startScreenShare).toHaveBeenCalledWith('without-audio'))
    expect(useApp.getState().screenPickerOpen).toBe(false)
  })

  it('compartilhando pelo app desktop, para a tela nativa', async () => {
    inVoice()
    grantCredentials()
    await startNativeScreenShare(SOURCE, 'without-audio')
    toggleScreenShare()
    await vi.waitFor(() => expect(useApp.getState().sharing).toBe(false))
    expect(bridge.sharing).toBeNull()
    expect(useApp.getState().ownScreenShare).toEqual({ kind: 'none' })
  })
})

describe('startScreenShare no app desktop', () => {
  it('pede as credenciais ao servidor, publica pela ponte nativa e mostra a própria tela como miniatura', async () => {
    inVoice()
    grantCredentials()
    useApp.setState({ screenPickerOpen: true })
    await startNativeScreenShare(SOURCE, 'with-system-audio')
    expect(socket.sent('voice:screen-credentials')).toHaveLength(1)
    expect(bridge.sharing).toEqual({ sourceId: 'screen:65537', audio: true, url: 'ws://livekit.test', token: 'jwt-tela' })
    expect(useApp.getState()).toMatchObject({ sharing: true, screenPickerOpen: false, ownScreenShare: { kind: 'native', thumbnail: SOURCE.thumbnail }, screens: ['eu'] })
    expect(socket.sent('voice:sharing')).toEqual([[true]])
    expect(voice.startScreenShare).not.toHaveBeenCalled()
  })

  it('não pede áudio onde o sistema não suporta', async () => {
    bridge.canShareAudio = false
    inVoice()
    grantCredentials()
    expect(canShareSystemAudio()).toBe(false)
    await startNativeScreenShare(SOURCE, 'with-system-audio')
    expect(bridge.sharing?.audio).toBe(false)
  })

  it('servidor recusa as credenciais: avisa e não publica', async () => {
    inVoice()
    socket.replyTo('voice:screen-credentials', () => ({ ok: false, error: 'Você não tem permissão para compartilhar a tela nesta sala' }))
    await startNativeScreenShare(SOURCE, 'without-audio')
    expect(useApp.getState().notice?.text).toBe('Não foi possível compartilhar a tela: Você não tem permissão para compartilhar a tela nesta sala')
    expect(bridge.sharing).toBeNull()
    expect(useApp.getState()).toMatchObject({ sharing: false, ownScreenShare: { kind: 'none' } })
    expect(socket.sent('voice:sharing')).toEqual([])
  })

  it('a ponte nativa falha: avisa e não marca "ao vivo"', async () => {
    inVoice()
    grantCredentials()
    bridge.startFailure = new Error('source not found: screen:65537')
    await startNativeScreenShare(SOURCE, 'without-audio')
    expect(useApp.getState().notice?.text).toBe('Não foi possível compartilhar a tela: source not found: screen:65537')
    expect(useApp.getState()).toMatchObject({ sharing: false, ownScreenShare: { kind: 'none' } })
    expect(socket.sent('voice:sharing')).toEqual([])
  })
})

describe('fim da tela nativa', () => {
  async function sharingNatively(): Promise<void> {
    inVoice()
    grantCredentials()
    await startNativeScreenShare(SOURCE, 'without-audio')
  }

  it('janela compartilhada fechada: desliga o "ao vivo" e avisa', async () => {
    await sharingNatively()
    bridge.end('source-closed')
    expect(useApp.getState()).toMatchObject({ sharing: false, ownScreenShare: { kind: 'none' }, screens: [] })
    expect(useApp.getState().notice).toMatchObject({ text: 'A janela compartilhada foi fechada', kind: 'info' })
    expect(socket.sent('voice:sharing')).toEqual([[true], [false]])
  })

  it('falha no meio: desliga o "ao vivo" e avisa', async () => {
    await sharingNatively()
    bridge.end('failed')
    expect(useApp.getState().sharing).toBe(false)
    expect(useApp.getState().notice).toMatchObject({ text: 'O compartilhamento de tela parou', kind: 'error' })
  })

  it('parada pedida ou pela queda da conexão: desliga sem aviso', async () => {
    await sharingNatively()
    bridge.end('disconnected')
    expect(useApp.getState().sharing).toBe(false)
    expect(useApp.getState().notice).toBeNull()
    await startNativeScreenShare(SOURCE, 'without-audio')
    bridge.end('stopped')
    expect(useApp.getState().sharing).toBe(false)
    expect(useApp.getState().notice).toBeNull()
  })

  it('o fim chega enquanto a tela ainda começa: fica sem compartilhar e avisa o motivo', async () => {
    inVoice()
    grantCredentials()
    bridge.endDuringStart = 'source-closed'
    await startNativeScreenShare(SOURCE, 'without-audio')
    expect(useApp.getState()).toMatchObject({ sharing: false, ownScreenShare: { kind: 'none' }, screens: [] })
    expect(socket.sent('voice:sharing')).toEqual([])
    expect(useApp.getState().notice).toMatchObject({ text: 'A janela compartilhada foi fechada', kind: 'info' })
  })

  it('stopScreenShare para a tela nativa e avisa o servidor uma vez, mesmo com o aviso de fim da ponte', async () => {
    await sharingNatively()
    await stopScreenShare()
    bridge.end('stopped')
    expect(bridge.sharing).toBeNull()
    expect(socket.sent('voice:sharing')).toEqual([[true], [false]])
    expect(voice.stopScreenShare).not.toHaveBeenCalled()
  })

  it('a ponte falha ao parar: o erro é relatado e o "ao vivo" desliga mesmo assim', async () => {
    await sharingNatively()
    bridge.stopFailure = new Error('travou')
    await stopScreenShare()
    expect(console.error).toHaveBeenCalledWith('[tela] não foi possível parar a tela nativa:', bridge.stopFailure)
    expect(useApp.getState()).toMatchObject({ sharing: false, ownScreenShare: { kind: 'none' } })
  })

  it('sair da sala para a tela nativa', async () => {
    vi.spyOn(voice, 'leave').mockImplementation(() => {})
    await sharingNatively()
    leaveVoice()
    await vi.waitFor(() => expect(bridge.sharing).toBeNull())
    expect(useApp.getState()).toMatchObject({ myVoiceChannelId: null, sharing: false, screenPickerOpen: false })
  })

  it('falha ao parar a tela nativa ao sair da sala vai para o console', async () => {
    vi.spyOn(voice, 'leave').mockImplementation(() => {})
    await sharingNatively()
    bridge.stopFailure = new Error('travou')
    leaveVoice()
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith('[tela] não foi possível parar a tela nativa:', bridge.stopFailure))
  })
})

describe('no navegador', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {})
  })

  it('cancelar o seletor do navegador não mostra erro', async () => {
    inVoice()
    vi.mocked(voice.startScreenShare).mockRejectedValue(new DOMException('cancelado', 'NotAllowedError'))
    await startBrowserScreenShare('without-audio')
    expect(useApp.getState().notice).toBeNull()
    expect(useApp.getState().sharing).toBe(false)
    expect(socket.sent('voice:sharing')).toEqual([])
  })

  it('publica pelo LiveKit do navegador sem pedir credenciais', async () => {
    inVoice()
    await startBrowserScreenShare('without-audio')
    expect(voice.startScreenShare).toHaveBeenCalledWith('without-audio')
    expect(socket.sent('voice:screen-credentials')).toEqual([])
    expect(useApp.getState()).toMatchObject({ sharing: true, ownScreenShare: { kind: 'browser' } })
  })

  it('stopScreenShare avisa o servidor uma vez, mesmo se o LiveKit também avisar', async () => {
    inVoice()
    useApp.setState({ sharing: true })
    await stopScreenShare()
    voice.onScreenShareEnded?.()
    expect(voice.stopScreenShare).toHaveBeenCalled()
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
