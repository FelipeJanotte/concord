// Sons de entrar/sair (B16) ligados às ações de voz, com socket falso e o ChimePlayer espionado.
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { User, VoiceState } from '@shared/types'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { bindVoiceEvents, joinVoice, leaveVoice } from './voice'
import { chimes, previewVoiceSound, resetVoiceSoundsForTests } from './voice-sounds'

const me: User = { id: 'eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#000', avatarUrl: null }
const st = (userId: string, channelId = 'sala'): VoiceState => ({ userId, channelId, muted: false, deafened: false, sharing: false })

let socket: FakeSocket
let play: MockInstance<typeof chimes.play>

const played = (): string[] => play.mock.calls.map((c) => c[0] as string)

async function enterRoom(channelId = 'sala'): Promise<void> {
  await joinVoice(channelId)
  play.mockClear() // o som da própria entrada é testado à parte
}

beforeEach(() => {
  useApp.setState({ ...initialState, self: me })
  resetVoiceSoundsForTests()
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindVoiceEvents(socket.asSocket())
  vi.spyOn(voice, 'join').mockResolvedValue({ micError: null })
  vi.spyOn(voice, 'leave').mockImplementation(() => {})
  play = vi.spyOn(chimes, 'play').mockReturnValue(true)
})

afterEach(() => {
  setSocket(null)
  vi.restoreAllMocks()
})

describe('outras pessoas', () => {
  it('alguém entra na minha sala → som de entrada; sai → som de saída', async () => {
    socket.receive('voice:state', [st('eu')])
    await enterRoom()
    socket.receive('voice:state', [st('eu'), st('ana')])
    socket.receive('voice:state', [st('eu')])
    expect(played()).toEqual(['join', 'leave'])
  })

  it('usa o volume e a saída escolhidos', async () => {
    useApp.setState({ voiceSoundsVolume: 0.3, audioOutputId: 'fone' })
    await enterRoom()
    socket.receive('voice:state', [st('eu'), st('ana')])
    expect(play).toHaveBeenCalledWith('join', { volume: 0.3, outputId: 'fone' })
  })

  it('movimento em outra sala não toca nada', async () => {
    await enterRoom()
    socket.receive('voice:state', [st('eu'), st('ana', 'outra')])
    socket.receive('voice:state', [st('eu')])
    expect(played()).toEqual([])
  })

  it('fora de uma sala não toca nada', () => {
    socket.receive('voice:state', [st('ana')])
    socket.receive('voice:state', [])
    expect(played()).toEqual([])
  })

  it('a lista que chega junto com a minha entrada não conta (quem já estava lá não "entrou")', async () => {
    socket.receive('voice:state', [st('ana'), st('bia')])
    await enterRoom()
    socket.receive('voice:state', [st('ana'), st('bia'), st('eu')])
    expect(played()).toEqual([])
  })

  it('várias mudanças no mesmo voice:state: um som de cada tipo', async () => {
    socket.receive('voice:state', [st('eu'), st('ana')])
    await enterRoom()
    socket.receive('voice:state', [st('eu'), st('bia'), st('caio')])
    expect(played()).toEqual(['join', 'leave'])
  })

  it('com deafen ou com o interruptor desligado: silêncio', async () => {
    await enterRoom()
    useApp.setState({ deafened: true })
    socket.receive('voice:state', [st('eu'), st('ana')])
    useApp.setState({ deafened: false, voiceSoundsEnabled: false })
    socket.receive('voice:state', [st('eu')])
    expect(played()).toEqual([])
  })

  it('trocar de sala passa a acompanhar a nova', async () => {
    await enterRoom('sala')
    await enterRoom('outra')
    socket.receive('voice:state', [st('eu', 'outra'), st('ana', 'sala')])
    expect(played()).toEqual([])
    socket.receive('voice:state', [st('eu', 'outra'), st('ana', 'outra')])
    expect(played()).toEqual(['join'])
  })
})

describe('a própria pessoa', () => {
  it('entrar toca o som de entrada; sair, o de saída', async () => {
    await joinVoice('sala')
    leaveVoice()
    expect(played()).toEqual(['join', 'leave'])
  })

  it('sair sem estar em sala não toca', () => {
    leaveVoice()
    expect(played()).toEqual([])
  })

  it('falha ao entrar não toca', async () => {
    vi.mocked(voice.join).mockRejectedValue(new Error('A voz não está configurada neste servidor'))
    await joinVoice('sala')
    expect(played()).toEqual([])
  })

  it('cair da sala sem pedir toca o som de saída', async () => {
    await enterRoom()
    voice.onUnexpectedDisconnect?.('A conexão com o servidor de voz caiu.')
    expect(played()).toEqual(['leave'])
  })
})

describe('Testar', () => {
  it('toca mesmo com o interruptor desligado', () => {
    useApp.setState({ voiceSoundsEnabled: false, voiceSoundsVolume: 0.8 })
    previewVoiceSound()
    expect(play).toHaveBeenCalledWith('join', { volume: 0.8, outputId: null })
  })
})
