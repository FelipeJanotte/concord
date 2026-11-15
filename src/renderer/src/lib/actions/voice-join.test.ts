// joinVoice com entradas canceladas e trocas de sala que falham (revisão do PR #9, itens 1 e 2).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { joinVoice } from './voice'
import { chimes } from './voice-sounds'

let inRoom: boolean

beforeEach(() => {
  useApp.setState({ ...initialState })
  setSocket(new FakeSocket().asSocket())
  inRoom = false
  vi.spyOn(voice, 'inRoom', 'get').mockImplementation(() => inRoom)
  vi.spyOn(chimes, 'play').mockReturnValue(true)
})

afterEach(() => {
  setSocket(null)
  vi.restoreAllMocks()
})

describe('item 1: entrada interrompida não é sucesso', () => {
  it('cancelada (saiu/trocou/caiu no meio): não grava a sala nem toca som', async () => {
    vi.spyOn(voice, 'join').mockResolvedValue({ micError: null, cancelled: true, canSpeak: true, canShare: true, canVideo: true })
    await joinVoice('sala-a')
    expect(useApp.getState()).toMatchObject({ myVoiceChannelId: null, joiningVoice: false })
    expect(chimes.play).not.toHaveBeenCalled()
  })

  it('o Socket.IO caiu durante a entrada: o estado fica fora da sala (antes ficava "na sala sem áudio")', async () => {
    vi.spyOn(voice, 'join').mockImplementation(async () => {
      // o handler de disconnect zera a sala enquanto o LiveKit ainda conecta
      useApp.setState({ myVoiceChannelId: null, status: 'reconnecting' })
      return { micError: null, cancelled: true, canSpeak: true, canShare: true, canVideo: true }
    })
    await joinVoice('sala-a')
    expect(useApp.getState().myVoiceChannelId).toBeNull()
  })

  it('entrada concluída grava a sala', async () => {
    vi.spyOn(voice, 'join').mockImplementation(async () => {
      inRoom = true
      return { micError: null, cancelled: false, canSpeak: true, canShare: true, canVideo: true }
    })
    await joinVoice('sala-a')
    expect(useApp.getState().myVoiceChannelId).toBe('sala-a')
  })
})

describe('item 2: trocar de sala e falhar', () => {
  beforeEach(() => {
    inRoom = true
    useApp.setState({ myVoiceChannelId: 'sala-a', view: { kind: 'voice', channelId: 'sala-a' } })
  })

  it('troca recusada pelo servidor: continua na sala antiga (estado e áudio) e avisa', async () => {
    vi.spyOn(voice, 'join').mockRejectedValue(new Error('Canal de voz não encontrado'))
    await joinVoice('sala-b')
    expect(useApp.getState().myVoiceChannelId).toBe('sala-a')
    expect(useApp.getState().notice?.text).toBe('Canal de voz não encontrado')
  })

  it('aceita pelo servidor mas o LiveKit falha: sai de tudo (não fica preso na sala antiga)', async () => {
    vi.spyOn(voice, 'join').mockImplementation(async () => {
      inRoom = false // o VoiceClient já fechou a antiga e desfez a nova
      throw new Error('Não foi possível conectar ao servidor de voz. Confira se o LiveKit está rodando (docker compose up -d).')
    })
    await joinVoice('sala-b')
    expect(useApp.getState()).toMatchObject({ myVoiceChannelId: null, speaking: {}, noMic: false, sharing: false })
    expect(useApp.getState().notice?.text).toContain('Confira se o LiveKit está rodando')
    expect(chimes.play).toHaveBeenCalledWith('leave', expect.anything())
  })
})
