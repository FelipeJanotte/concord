// VoiceClient (B2) com Room, microfone e faixas do LiveKit falsos.
import { DisconnectReason, RoomEvent, Track, type LocalAudioTrack, type Room } from 'livekit-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JoinVoiceResult } from '@shared/types'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { VoiceClient } from './voice'

type Listener = (...args: unknown[]) => void

class FakeRoom {
  listeners = new Map<string, Listener[]>()
  connect = vi.fn(async (_url: string, _token: string, _opts?: unknown) => {})
  disconnect = vi.fn(async () => {})
  startAudio = vi.fn(async () => {})
  localParticipant = {
    identity: 'eu',
    publishTrack: vi.fn(async (_track: unknown, _opts?: unknown) => ({})),
    setScreenShareEnabled: vi.fn(async (_on: boolean, _opts?: unknown) => undefined)
  }

  on(event: string, fn: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn])
    return this
  }

  removeAllListeners(): this {
    this.listeners.clear()
    return this
  }

  fire(event: RoomEvent, ...args: unknown[]): void {
    for (const fn of this.listeners.get(event) ?? []) fn(...args)
  }
}

class FakeMic {
  muted = false
  stop = vi.fn()
  mute = vi.fn(async () => {
    this.muted = true
    return this
  })
  unmute = vi.fn(async () => {
    this.muted = false
    return this
  })
}

class FakeElement {
  muted = false
  remove = vi.fn()
}

class FakeRemoteTrack {
  attachedElements: FakeElement[] = []
  constructor(
    readonly kind: Track.Kind = Track.Kind.Audio,
    readonly source: Track.Source = kind === Track.Kind.Audio ? Track.Source.Microphone : Track.Source.Camera
  ) {}
  attach(el?: FakeElement): FakeElement {
    const target = el ?? new FakeElement()
    this.attachedElements.push(target)
    return target
  }
  detachOne = vi.fn()
  detach(el?: FakeElement): FakeElement[] {
    if (el) {
      this.detachOne(el)
      this.attachedElements = this.attachedElements.filter((e) => e !== el)
      return [el]
    }
    const els = this.attachedElements
    this.attachedElements = []
    return els
  }
}

const CREDS: JoinVoiceResult = { ok: true, url: 'ws://livekit.test:7880', token: 'jwt-de-teste' }

let socket: FakeSocket
let rooms: FakeRoom[]
let mic: FakeMic | null
let micError: Error | null
let client: VoiceClient

function makeClient(): VoiceClient {
  const c = new VoiceClient({
    createRoom: () => {
      const room = new FakeRoom()
      rooms.push(room)
      return room as unknown as Room
    },
    createMicTrack: async () => {
      if (micError) throw micError
      mic = new FakeMic()
      return mic as unknown as LocalAudioTrack
    }
  })
  c.setSocket(socket.asSocket())
  return c
}

const lastRoom = (): FakeRoom => rooms[rooms.length - 1]
const speaker = (identity: string): { identity: string } => ({ identity })

beforeEach(() => {
  useApp.setState({ ...initialState, self: { id: 'eu', accountId: 'a', name: 'Eu', tag: 'eu', color: '#000', avatarUrl: null } })
  socket = new FakeSocket()
  socket.replyTo('voice:join', () => CREDS)
  rooms = []
  mic = null
  micError = null
  client = makeClient()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('join', () => {
  it('pede o token ao servidor, conecta no LiveKit e publica o microfone', async () => {
    expect(await client.join('sala-1')).toEqual({ micError: null })
    expect(socket.sent('voice:join')).toEqual([[{ channelId: 'sala-1', muted: false, deafened: false }]])
    const room = lastRoom()
    expect(room.connect).toHaveBeenCalledWith('ws://livekit.test:7880', 'jwt-de-teste', { autoSubscribe: true })
    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(mic, { source: Track.Source.Microphone })
    expect(room.startAudio).toHaveBeenCalled()
  })

  it('sem microfone entra só para ouvir e avisa o servidor como silenciado', async () => {
    micError = new DOMException('negado', 'NotAllowedError')
    const res = await client.join('sala-1')
    expect(res.micError).toBe(micError)
    expect(socket.sent('voice:join')[0][0]).toMatchObject({ muted: true })
    expect(lastRoom().connect).toHaveBeenCalled()
    expect(lastRoom().localParticipant.publishTrack).not.toHaveBeenCalled()
  })

  it('entra já silenciado se o mute estava ligado', async () => {
    client.setMuted(true)
    client.setDeafened(true)
    await client.join('sala-1')
    expect(mic!.mute).toHaveBeenCalled()
    expect(socket.sent('voice:join')[0][0]).toEqual({ channelId: 'sala-1', muted: true, deafened: true })
  })

  it('servidor recusa: libera o microfone e não conecta', async () => {
    socket.replyTo('voice:join', () => ({ ok: false, error: 'A voz não está configurada neste servidor' }))
    await expect(client.join('sala-1')).rejects.toThrow('A voz não está configurada neste servidor')
    expect(mic!.stop).toHaveBeenCalled()
    expect(rooms).toHaveLength(0)
  })

  it('sem socket falha antes de pedir o microfone', async () => {
    client.setSocket(null)
    await expect(client.join('sala-1')).rejects.toThrow('Sem conexão com o servidor')
    expect(mic).toBeNull()
  })

  it('LiveKit fora do ar: avisa o servidor que saiu, libera o microfone e explica o erro', async () => {
    const c = new VoiceClient({
      createRoom: () => {
        const room = new FakeRoom()
        room.connect.mockRejectedValue(new Error('could not establish signal connection'))
        rooms.push(room)
        return room as unknown as Room
      },
      createMicTrack: async () => (mic = new FakeMic()) as unknown as LocalAudioTrack
    })
    c.setSocket(socket.asSocket())
    await expect(c.join('sala-1')).rejects.toThrow('Não foi possível conectar ao servidor de voz')
    expect(socket.sent('voice:leave')).toHaveLength(1)
    expect(mic!.stop).toHaveBeenCalled()
  })

  it('sair enquanto conecta não mostra erro nem deixa nada aberto', async () => {
    let finishConnect: (err?: Error) => void = () => {}
    const c = new VoiceClient({
      createRoom: () => {
        const room = new FakeRoom()
        room.connect.mockImplementation(() => new Promise<void>((res, rej) => (finishConnect = (e) => (e ? rej(e) : res()))))
        rooms.push(room)
        return room as unknown as Room
      },
      createMicTrack: async () => (mic = new FakeMic()) as unknown as LocalAudioTrack
    })
    c.setSocket(socket.asSocket())
    const joining = c.join('sala-1')
    await vi.waitFor(() => expect(rooms).toHaveLength(1))
    c.leave()
    finishConnect(new Error('Client initiated disconnect'))
    await expect(joining).resolves.toEqual({ micError: null })
    expect(lastRoom().disconnect).toHaveBeenCalled()
    expect(lastRoom().localParticipant.publishTrack).not.toHaveBeenCalled()
    expect(mic!.stop).toHaveBeenCalled()
  })

  it('trocar de sala fecha a conexão anterior antes de abrir a nova', async () => {
    await client.join('sala-1')
    const first = lastRoom()
    const firstMic = mic!
    await client.join('sala-2')
    expect(first.disconnect).toHaveBeenCalled()
    expect(firstMic.stop).toHaveBeenCalled()
    expect(rooms).toHaveLength(2)
    expect(socket.sent('voice:leave')).toHaveLength(0) // o servidor troca de sala sozinho no voice:join
  })
})

describe('leave e teardown', () => {
  it('leave avisa o servidor e fecha tudo', async () => {
    await client.join('sala-1')
    const track = new FakeRemoteTrack()
    lastRoom().fire(RoomEvent.TrackSubscribed, track)
    const el = track.attachedElements[0]
    client.leave()
    expect(socket.sent('voice:leave')).toHaveLength(1)
    expect(lastRoom().disconnect).toHaveBeenCalled()
    expect(mic!.stop).toHaveBeenCalled()
    expect(el.remove).toHaveBeenCalled()
  })

  it('leave fora da sala não manda nada', () => {
    client.leave()
    expect(socket.sent('voice:leave')).toHaveLength(0)
  })

  it('teardown não avisa o servidor (usado quando o socket cai)', async () => {
    await client.join('sala-1')
    client.teardown()
    expect(socket.sent('voice:leave')).toHaveLength(0)
    expect(lastRoom().disconnect).toHaveBeenCalled()
  })
})

describe('áudio, mute e deafen', () => {
  it('toca o áudio de quem chega e ignora vídeo', async () => {
    await client.join('sala-1')
    const audio = new FakeRemoteTrack()
    const video = new FakeRemoteTrack(Track.Kind.Video)
    lastRoom().fire(RoomEvent.TrackSubscribed, audio)
    lastRoom().fire(RoomEvent.TrackSubscribed, video)
    expect(audio.attachedElements).toHaveLength(1)
    expect(video.attachedElements).toHaveLength(0)
  })

  it('quem sai tem o elemento de áudio removido', async () => {
    await client.join('sala-1')
    const audio = new FakeRemoteTrack()
    lastRoom().fire(RoomEvent.TrackSubscribed, audio)
    const el = audio.attachedElements[0]
    lastRoom().fire(RoomEvent.TrackUnsubscribed, audio)
    expect(el.remove).toHaveBeenCalled()
  })

  it('mute liga e desliga o microfone publicado', async () => {
    await client.join('sala-1')
    client.setMuted(true)
    expect(mic!.mute).toHaveBeenCalled()
    client.setMuted(false)
    expect(mic!.unmute).toHaveBeenCalled()
  })

  it('deafen silencia o áudio de todos, inclusive de quem chega depois', async () => {
    await client.join('sala-1')
    const before = new FakeRemoteTrack()
    lastRoom().fire(RoomEvent.TrackSubscribed, before)
    client.setDeafened(true)
    expect(before.attachedElements[0].muted).toBe(true)
    const after = new FakeRemoteTrack()
    lastRoom().fire(RoomEvent.TrackSubscribed, after)
    expect(after.attachedElements[0].muted).toBe(true)
    client.setDeafened(false)
    expect(before.attachedElements[0].muted).toBe(false)
    expect(after.attachedElements[0].muted).toBe(false)
  })
})

describe('quem está falando', () => {
  it('vem do ActiveSpeakersChanged do LiveKit', async () => {
    await client.join('sala-1')
    lastRoom().fire(RoomEvent.ActiveSpeakersChanged, [speaker('eu'), speaker('outro')])
    expect(useApp.getState().speaking).toEqual({ eu: true, outro: true })
    lastRoom().fire(RoomEvent.ActiveSpeakersChanged, [])
    expect(useApp.getState().speaking).toEqual({})
  })

  it('mute esconde a própria pessoa; deafen esconde os outros', async () => {
    await client.join('sala-1')
    lastRoom().fire(RoomEvent.ActiveSpeakersChanged, [speaker('eu'), speaker('outro')])
    client.setMuted(true)
    expect(useApp.getState().speaking).toEqual({ outro: true })
    client.setMuted(false)
    client.setDeafened(true)
    expect(useApp.getState().speaking).toEqual({ eu: true })
  })

  it('não atualiza a store se nada mudou', async () => {
    await client.join('sala-1')
    lastRoom().fire(RoomEvent.ActiveSpeakersChanged, [speaker('outro')])
    const before = useApp.getState().speaking
    lastRoom().fire(RoomEvent.ActiveSpeakersChanged, [speaker('outro')])
    expect(useApp.getState().speaking).toBe(before)
  })

  it('sair limpa quem está falando', async () => {
    await client.join('sala-1')
    lastRoom().fire(RoomEvent.ActiveSpeakersChanged, [speaker('outro')])
    client.leave()
    expect(useApp.getState().speaking).toEqual({})
  })
})

describe('queda da sala', () => {
  it('removido pelo servidor: sai, avisa o servidor e chama onUnexpectedDisconnect', async () => {
    const onDrop = vi.fn()
    client.onUnexpectedDisconnect = onDrop
    await client.join('sala-1')
    lastRoom().fire(RoomEvent.Disconnected, DisconnectReason.PARTICIPANT_REMOVED)
    expect(onDrop).toHaveBeenCalledWith('Você foi removido da sala de voz.')
    expect(socket.sent('voice:leave')).toHaveLength(1)
    expect(mic!.stop).toHaveBeenCalled()
  })

  it.each([
    [DisconnectReason.ROOM_DELETED, 'A sala de voz foi encerrada.'],
    [DisconnectReason.DUPLICATE_IDENTITY, 'Você entrou nesta sala em outra conexão.'],
    [undefined, 'A conexão com o servidor de voz caiu.']
  ])('motivo %s vira uma frase da interface', async (reason, message) => {
    const onDrop = vi.fn()
    client.onUnexpectedDisconnect = onDrop
    await client.join('sala-1')
    lastRoom().fire(RoomEvent.Disconnected, reason)
    expect(onDrop).toHaveBeenCalledWith(message)
  })

  it('sair por conta própria não dispara o aviso', async () => {
    const onDrop = vi.fn()
    client.onUnexpectedDisconnect = onDrop
    await client.join('sala-1')
    const room = lastRoom()
    const disconnectedHandlers = room.listeners.get(RoomEvent.Disconnected) ?? []
    client.leave()
    // Mesmo que o LiveKit ainda entregue o evento de um handler antigo:
    for (const fn of disconnectedHandlers) fn(DisconnectReason.CLIENT_INITIATED)
    expect(onDrop).not.toHaveBeenCalled()
  })
})

describe('tela', () => {
  const screenTrack = (): FakeRemoteTrack => new FakeRemoteTrack(Track.Kind.Video, Track.Source.ScreenShare)
  const participant = (identity: string) => ({ identity })

  it('publica a tela pelo LiveKit com o áudio pedido', async () => {
    await client.join('sala-1')
    await client.startScreenShare(true)
    expect(lastRoom().localParticipant.setScreenShareEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ audio: true, systemAudio: 'include', contentHint: 'detail' })
    )
    await client.startScreenShare(false)
    expect(lastRoom().localParticipant.setScreenShareEnabled).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ audio: false, systemAudio: 'exclude' })
    )
  })

  it('fora da sala não dá para compartilhar', async () => {
    await expect(client.startScreenShare(false)).rejects.toThrow('Entre numa sala de voz')
  })

  it('parar desliga a publicação', async () => {
    await client.join('sala-1')
    await client.stopScreenShare()
    expect(lastRoom().localParticipant.setScreenShareEnabled).toHaveBeenCalledWith(false)
    await expect(new VoiceClient().stopScreenShare()).resolves.toBeUndefined() // fora da sala: nada
  })

  it('a tela de quem compartilha aparece em store.screens e some quando acaba', async () => {
    await client.join('sala-1')
    const track = screenTrack()
    lastRoom().fire(RoomEvent.TrackSubscribed, track, {}, participant('ana'))
    expect(useApp.getState().screens).toEqual(['ana'])
    expect(track.attachedElements).toHaveLength(0) // vídeo só toca quando a UI liga num <video>
    lastRoom().fire(RoomEvent.TrackUnsubscribed, track, {}, participant('ana'))
    expect(useApp.getState().screens).toEqual([])
  })

  it('vídeo que não é tela (câmera) é ignorado', async () => {
    await client.join('sala-1')
    lastRoom().fire(RoomEvent.TrackSubscribed, new FakeRemoteTrack(Track.Kind.Video), {}, participant('ana'))
    expect(useApp.getState().screens).toEqual([])
  })

  it('o áudio da tela toca como os outros áudios (e respeita o deafen)', async () => {
    await client.join('sala-1')
    const screenAudio = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.ScreenShareAudio)
    lastRoom().fire(RoomEvent.TrackSubscribed, screenAudio, {}, participant('ana'))
    client.setDeafened(true)
    expect(screenAudio.attachedElements[0].muted).toBe(true)
  })

  it('attachScreen liga a tela num <video> e devolve quem desliga', async () => {
    await client.join('sala-1')
    const track = screenTrack()
    lastRoom().fire(RoomEvent.TrackSubscribed, track, {}, participant('ana'))
    const video = new FakeElement()
    const detach = client.attachScreen('ana', video as unknown as HTMLVideoElement)
    expect(track.attachedElements).toEqual([video])
    detach()
    expect(track.detachOne).toHaveBeenCalledWith(video)
    // Quem não está compartilhando: não faz nada.
    expect(() => client.attachScreen('ninguem', video as unknown as HTMLVideoElement)()).not.toThrow()
  })

  it('a própria tela entra como prévia e, ao parar (inclusive pelo sistema), avisa o app', async () => {
    const ended = vi.fn()
    client.onScreenShareEnded = ended
    await client.join('sala-1')
    const local = screenTrack()
    const pub = { source: Track.Source.ScreenShare, track: local }
    lastRoom().fire(RoomEvent.LocalTrackPublished, pub, participant('eu'))
    expect(useApp.getState().screens).toEqual(['eu'])
    lastRoom().fire(RoomEvent.LocalTrackUnpublished, pub, participant('eu'))
    expect(useApp.getState().screens).toEqual([])
    expect(ended).toHaveBeenCalledOnce()
  })

  it('publicar/despublicar o microfone não mexe na tela', async () => {
    const ended = vi.fn()
    client.onScreenShareEnded = ended
    await client.join('sala-1')
    const pub = { source: Track.Source.Microphone, track: new FakeRemoteTrack() }
    lastRoom().fire(RoomEvent.LocalTrackPublished, pub, participant('eu'))
    lastRoom().fire(RoomEvent.LocalTrackUnpublished, pub, participant('eu'))
    expect(useApp.getState().screens).toEqual([])
    expect(ended).not.toHaveBeenCalled()
  })

  it('sair limpa as telas sem disparar o aviso de fim', async () => {
    const ended = vi.fn()
    client.onScreenShareEnded = ended
    await client.join('sala-1')
    lastRoom().fire(RoomEvent.TrackSubscribed, screenTrack(), {}, participant('ana'))
    client.leave()
    expect(useApp.getState().screens).toEqual([])
    expect(ended).not.toHaveBeenCalled()
  })
})
