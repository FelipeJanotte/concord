// Câmera nas ações (B21): ligar/desligar, sem sala, sem permissão, erro do sistema e perder a permissão.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { User } from '@shared/types'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { attachCamera, bindVoiceEvents, joinVoice, leaveVoice, toggleCamera } from './voice'
import { chimes, resetVoiceSoundsForTests } from './voice-sounds'

const me: User = { id: 'eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#000', avatarUrl: null }
let setCamera: MockInstance<(on: boolean) => Promise<void>>

function join(canVideo = true): Promise<void> {
  vi.spyOn(voice, 'join').mockResolvedValue({ micError: null, cancelled: false, canSpeak: true, canShare: true, canVideo })
  return joinVoice('sala')
}

beforeEach(() => {
  useApp.setState({ ...initialState, self: me })
  resetVoiceSoundsForTests()
  const socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindVoiceEvents(socket.asSocket())
  vi.spyOn(chimes, 'play').mockReturnValue(true)
  setCamera = vi.spyOn(voice, 'setCamera').mockResolvedValue()
})

afterEach(() => {
  setSocket(null)
  vi.restoreAllMocks()
})

describe('toggleCamera', () => {
  it('fora da sala só avisa', async () => {
    await toggleCamera()
    expect(setCamera).not.toHaveBeenCalled()
    expect(useApp.getState().notice?.text).toBe('Entre numa sala de voz para ligar a câmera.')
  })

  it('liga e desliga', async () => {
    await join()
    expect(useApp.getState()).toMatchObject({ voiceCanVideo: true, cameraOn: false })
    await toggleCamera()
    expect(setCamera).toHaveBeenLastCalledWith(true)
    expect(useApp.getState().cameraOn).toBe(true)
    await toggleCamera()
    expect(setCamera).toHaveBeenLastCalledWith(false)
    expect(useApp.getState().cameraOn).toBe(false)
  })

  it('sem a permissão video avisa e não liga', async () => {
    await join(false)
    await toggleCamera()
    expect(setCamera).not.toHaveBeenCalled()
    expect(useApp.getState().notice?.text).toBe('Você não tem permissão para ligar a câmera nesta sala.')
  })

  it('câmera negada ou em uso: mensagem clara e continua desligada', async () => {
    await join()
    setCamera.mockRejectedValueOnce(new DOMException('x', 'NotReadableError'))
    await toggleCamera()
    expect(useApp.getState().cameraOn).toBe(false)
    expect(useApp.getState().notice?.text).toBe('A câmera está sendo usada por outro programa.')
    setCamera.mockRejectedValueOnce(new DOMException('x', 'NotAllowedError'))
    await toggleCamera()
    expect(useApp.getState().notice?.text).toBe('Permissão de câmera negada.')
  })

  it('perder video ou a câmera parar sozinha desliga o botão; sair da sala também', async () => {
    await join()
    await toggleCamera()
    voice.onPermissionsChange?.({ canSpeak: true, canShare: true, canVideo: false })
    expect(useApp.getState()).toMatchObject({ cameraOn: false, voiceCanVideo: false })

    useApp.setState({ cameraOn: true })
    voice.onCameraEnded?.()
    expect(useApp.getState().cameraOn).toBe(false)

    useApp.setState({ cameraOn: true })
    vi.spyOn(voice, 'leave').mockImplementation(() => {})
    leaveVoice()
    expect(useApp.getState()).toMatchObject({ cameraOn: false, voiceCanVideo: true })
  })

  it('attachCamera repassa para o VoiceClient', () => {
    const detach = vi.fn()
    const spy = vi.spyOn(voice, 'attachCamera').mockReturnValue(detach)
    const el = {} as HTMLVideoElement
    expect(attachCamera('ana', el)).toBe(detach)
    expect(spy).toHaveBeenCalledWith('ana', el)
  })
})
