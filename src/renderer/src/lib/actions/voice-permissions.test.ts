// Permissões de voz (v2) nas ações: entrar sem speak, mute/tela sem permissão, mudanças ao vivo e saída forçada.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User, VoiceState } from '@shared/types'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { bindVoiceEvents, joinVoice, toggleMute, toggleScreenShare, UNMUTE_RESYNC_MS } from './voice'
import { chimes, resetVoiceSoundsForTests } from './voice-sounds'

const me: User = { id: 'eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#000', avatarUrl: null }
const st = (userId: string): VoiceState => ({ userId, channelId: 'sala', muted: false, deafened: false, sharing: false })

let socket: FakeSocket

function join(perms: { canSpeak: boolean; canShare: boolean; canVideo: boolean }, micError: unknown = null): Promise<void> {
  vi.spyOn(voice, 'join').mockResolvedValue({ micError, cancelled: false, ...perms })
  return joinVoice('sala')
}

beforeEach(() => {
  useApp.setState({ ...initialState, self: me })
  resetVoiceSoundsForTests()
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindVoiceEvents(socket.asSocket())
  vi.spyOn(chimes, 'play').mockReturnValue(true)
  vi.spyOn(voice, 'setMuted').mockImplementation(() => {})
  vi.spyOn(voice, 'setDeafened').mockImplementation(() => {})
})

afterEach(() => {
  setSocket(null)
  vi.restoreAllMocks()
})

describe('entrar', () => {
  it('sem speak: entra só para ouvir, com a mensagem de permissão (não a de microfone)', async () => {
    await join({ canSpeak: false, canShare: true, canVideo: true })
    expect(useApp.getState()).toMatchObject({ myVoiceChannelId: 'sala', voiceCanSpeak: false, voiceCanShare: true, noMic: false })
    expect(useApp.getState().notice?.text).toBe('Você não tem permissão para falar nesta sala: entrou só para ouvir.')
  })

  it('com speak e sem microfone: continua a mensagem de microfone', async () => {
    await join({ canSpeak: true, canShare: true, canVideo: true }, new DOMException('negado', 'NotAllowedError'))
    expect(useApp.getState()).toMatchObject({ noMic: true, voiceCanSpeak: true })
    expect(useApp.getState().notice?.text).toContain('Permissão de microfone negada')
  })
})

describe('mute e tela sem permissão', () => {
  it('sem speak, o botão de microfone só avisa (e o deafen ainda pode ser tirado)', async () => {
    await join({ canSpeak: false, canShare: true, canVideo: true })
    toggleMute()
    expect(useApp.getState().notice?.text).toBe('Você não tem permissão para falar nesta sala.')
    expect(socket.sent('voice:update')).toEqual([])
    useApp.setState({ deafened: true })
    toggleMute()
    expect(useApp.getState().deafened).toBe(false)
    expect(socket.sent('voice:update').at(-1)).toEqual([{ muted: true, deafened: false }])
  })

  it('sem share, o botão de tela só avisa', async () => {
    await join({ canSpeak: true, canShare: false, canVideo: true })
    toggleScreenShare()
    expect(useApp.getState().notice?.text).toBe('Você não tem permissão para compartilhar a tela nesta sala.')
    expect(useApp.getState().screenPickerOpen).toBe(false)
  })
})

describe('permissões mudando com a pessoa na sala', () => {
  it('perdeu speak: avisa e manda voice:update silenciado', async () => {
    await join({ canSpeak: true, canShare: true, canVideo: true })
    voice.onPermissionsChange?.({ canSpeak: false, canShare: true, canVideo: true })
    expect(useApp.getState().voiceCanSpeak).toBe(false)
    expect(useApp.getState().notice?.text).toBe('Você não pode mais falar nesta sala.')
    expect(socket.sent('voice:update').at(-1)).toEqual([{ muted: true, deafened: false }])
  })

  it('recuperou speak: avisa e manda o estado real (desmutado)', async () => {
    await join({ canSpeak: false, canShare: true, canVideo: true })
    voice.onPermissionsChange?.({ canSpeak: true, canShare: true, canVideo: true })
    expect(useApp.getState().voiceCanSpeak).toBe(true)
    expect(useApp.getState().notice?.text).toBe('Agora você pode falar nesta sala.')
    expect(socket.sent('voice:update').at(-1)).toEqual([{ muted: false, deafened: false }])
  })

  it('perdeu share compartilhando: desliga o "ao vivo"', async () => {
    await join({ canSpeak: true, canShare: true, canVideo: true })
    useApp.setState({ sharing: true })
    voice.onPermissionsChange?.({ canSpeak: true, canShare: false, canVideo: true })
    expect(useApp.getState()).toMatchObject({ voiceCanShare: false, sharing: false })
    expect(socket.sent('voice:sharing')).toEqual([[false]])
  })
})

describe('saída forçada pelo servidor', () => {
  it('o voice:state sem a própria conexão tira da sala e toca o som de saída (B16)', async () => {
    vi.spyOn(voice, 'teardown').mockImplementation(() => {})
    await join({ canSpeak: true, canShare: true, canVideo: true })
    vi.mocked(chimes.play).mockClear()
    socket.receive('voice:state', [st('ana')])
    expect(useApp.getState()).toMatchObject({ myVoiceChannelId: null, voiceCanSpeak: true })
    expect(voice.teardown).toHaveBeenCalled()
    expect(chimes.play).toHaveBeenCalledWith('leave', expect.anything())
    expect(useApp.getState().notice?.text).toBe('Você saiu da sala de voz.')
  })
})

describe('fim do silêncio do moderador (B6)', () => {
  const mineSilenced = (serverMuted: boolean): VoiceState => ({ ...st('eu'), muted: serverMuted, serverMuted })

  it('o servidor avisa que o silêncio acabou: relê as permissões do LiveKit já e, se ainda faltar, de novo depois', async () => {
    vi.useFakeTimers()
    try {
      const sync = vi.spyOn(voice, 'syncPermissions').mockResolvedValue()
      await join({ canSpeak: false, canShare: true, canVideo: true })
      socket.receive('voice:state', [mineSilenced(true)])
      expect(sync).not.toHaveBeenCalled()
      socket.receive('voice:state', [mineSilenced(false)])
      expect(sync).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(UNMUTE_RESYNC_MS)
      expect(sync).toHaveBeenCalledTimes(2) // o LiveKit ainda não tinha avisado
    } finally {
      vi.useRealTimers()
    }
  })

  it('se a permissão já chegou pelo LiveKit, não relê de novo', async () => {
    vi.useFakeTimers()
    try {
      const sync = vi.spyOn(voice, 'syncPermissions').mockResolvedValue()
      await join({ canSpeak: false, canShare: true, canVideo: true })
      socket.receive('voice:state', [mineSilenced(true)])
      socket.receive('voice:state', [mineSilenced(false)])
      voice.onPermissionsChange?.({ canSpeak: true, canShare: true, canVideo: true })
      vi.advanceTimersByTime(UNMUTE_RESYNC_MS)
      expect(sync).toHaveBeenCalledTimes(1)
      // e o app avisa o servidor que está desmutado (não precisa clicar)
      expect(socket.sent('voice:update').at(-1)?.[0]).toEqual({ muted: false, deafened: false })
    } finally {
      vi.useRealTimers()
    }
  })

  it('sem silêncio antes (ou podendo falar), não faz nada', async () => {
    const sync = vi.spyOn(voice, 'syncPermissions').mockResolvedValue()
    await join({ canSpeak: true, canShare: true, canVideo: true })
    socket.receive('voice:state', [mineSilenced(false)])
    socket.receive('voice:state', [mineSilenced(true)])
    socket.receive('voice:state', [mineSilenced(false)])
    expect(sync).not.toHaveBeenCalled()
  })
})
