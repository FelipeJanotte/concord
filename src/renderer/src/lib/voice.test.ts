import { DisconnectReason, RoomEvent, Track, type AudioCaptureOptions, type LocalAudioTrack, type Room } from 'livekit-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JoinVoiceResult } from '@shared/types'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { MUSIC_BOT_VOLUME_ID, screenOwnerOf, VoiceClient } from './voice'
import type { VoiceLeveler } from './leveler/leveler'
import type { TrackSource } from './speaking/detector'

const detectors = vi.hoisted(() => {
  class FakeSpeakingDetector {
    onChange: ((ids: string[]) => void) | null = null
    watched = new Map<string, TrackSource>()
    destroyed = false
    watch(id: string, trackOf: TrackSource): void {
      this.watched.set(id, trackOf)
    }
    unwatch(id: string): void {
      this.watched.delete(id)
    }
    destroy(): void {
      this.destroyed = true
    }
    emit(ids: string[]): void {
      this.onChange?.(ids)
    }
  }
  return { FakeSpeakingDetector, created: [] as FakeSpeakingDetector[] }
})

vi.mock('./speaking/detector', () => ({
  SpeakingDetector: class extends detectors.FakeSpeakingDetector {
    constructor() {
      super()
      detectors.created.push(this)
    }
  }
}))

const detector = () => detectors.created[detectors.created.length - 1]

type Listener = (...args: unknown[]) => void

class FakeRoom {
  listeners = new Map<string, Listener[]>()
  remoteParticipants = new Map<string, FakeParticipant>()
  connect = vi.fn(async (_url: string, _token: string, _opts?: unknown) => {})
  disconnect = vi.fn(async () => {})
  startAudio = vi.fn(async () => {})
  switchActiveDevice = vi.fn(async (_kind: string, _id: string) => true)
  constructor(readonly opts: { outputDeviceId: string | null } = { outputDeviceId: null }) {}
  localParticipant = {
    identity: 'eu',
    publishTrack: vi.fn(async (_track: unknown, _opts?: unknown) => ({})),
    unpublishTrack: vi.fn(async (_track: unknown) => ({})),
    permissions: { canPublish: true, canPublishSources: [1, 2, 3] } as { canPublish: boolean; canPublishSources: number[] },
    setScreenShareEnabled: vi.fn(async (_on: boolean, _opts?: unknown) => undefined),
    setCameraEnabled: vi.fn(async (_on: boolean, _capture?: unknown, _publish?: unknown) => undefined)
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

class FakePublication {
  subscribed = false
  constructor(readonly source: Track.Source) {}
  setSubscribed(subscribed: boolean): void {
    this.subscribed = subscribed
  }
}

class FakeParticipant {
  trackPublications = new Map<string, FakePublication>()
  constructor(
    readonly identity: string,
    readonly attributes: Record<string, string> = {},
    readonly metadata?: string
  ) {}
  publish(source: Track.Source): FakePublication {
    const publication = new FakePublication(source)
    this.trackPublications.set(`${this.identity}-${source}`, publication)
    return publication
  }
}

class FakeMic {
  muted = false
  stop = vi.fn()
  setAudioContext = vi.fn(async (_ctx: unknown) => {})
  setProcessor = vi.fn(async (_p: unknown) => {})
  stopProcessor = vi.fn(async () => {})
  nativeSuppression = true
  mediaStreamTrack = { applyConstraints: vi.fn(async (_c: unknown) => {}) }
  restartTrack = vi.fn(async (opts?: AudioCaptureOptions) => {
    this.nativeSuppression = opts?.noiseSuppression !== false
  })
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
  mediaStreamTrack = { id: 'faixa' }
  detachOne = vi.fn()
  setVolume = vi.fn()
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

const CREDS: JoinVoiceResult = {
  ok: true,
  url: 'ws://livekit.test:7880',
  token: 'jwt-de-teste',
  canSpeak: true,
  canShare: true,
  canVideo: true
}

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
    expect(await client.join('sala-1')).toEqual({ micError: null, cancelled: false, canSpeak: true, canShare: true, canVideo: true })
    expect(socket.sent('voice:join')).toEqual([[{ channelId: 'sala-1', muted: false, deafened: false }]])
    const room = lastRoom()
    expect(room.connect).toHaveBeenCalledWith('ws://livekit.test:7880', 'jwt-de-teste', { autoSubscribe: false })
    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(mic, { source: Track.Source.Microphone, forceStereo: false })
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
    await expect(joining).resolves.toEqual({ micError: null, cancelled: true, canSpeak: true, canShare: true, canVideo: true })
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
    expect(socket.sent('voice:leave')).toHaveLength(0)
  })
})

describe('leave e teardown', () => {
  it('leave avisa o servidor e fecha tudo', async () => {
    await client.join('sala-1')
    const track = new FakeRemoteTrack()
    lastRoom().fire(RoomEvent.TrackSubscribed, track, {}, { identity: 'ana' })
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
    lastRoom().fire(RoomEvent.TrackSubscribed, audio, {}, { identity: 'ana' })
    lastRoom().fire(RoomEvent.TrackSubscribed, video, {}, { identity: 'ana' })
    expect(audio.attachedElements).toHaveLength(1)
    expect(video.attachedElements).toHaveLength(0)
  })

  it('quem sai tem o elemento de áudio removido', async () => {
    await client.join('sala-1')
    const audio = new FakeRemoteTrack()
    lastRoom().fire(RoomEvent.TrackSubscribed, audio, {}, { identity: 'ana' })
    const el = audio.attachedElements[0]
    lastRoom().fire(RoomEvent.TrackUnsubscribed, audio, {}, { identity: 'ana' })
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
    lastRoom().fire(RoomEvent.TrackSubscribed, before, {}, { identity: 'ana' })
    client.setDeafened(true)
    expect(before.attachedElements[0].muted).toBe(true)
    const after = new FakeRemoteTrack()
    lastRoom().fire(RoomEvent.TrackSubscribed, after, {}, { identity: 'ana' })
    expect(after.attachedElements[0].muted).toBe(true)
    client.setDeafened(false)
    expect(before.attachedElements[0].muted).toBe(false)
    expect(after.attachedElements[0].muted).toBe(false)
  })
})

describe('quem está falando', () => {
  it('mede o meu microfone (a faixa atual, já com o filtro) desde a entrada na sala', async () => {
    await client.join('sala-1')
    const mine = detector().watched.get('eu')
    expect(mine?.()).toBe(mic!.mediaStreamTrack)
    const filtered = { id: 'filtrada' }
    mic!.mediaStreamTrack = filtered as never
    expect(mine?.()).toBe(filtered)
  })

  it('mede o microfone de cada pessoa da sala e para quando a faixa sai', async () => {
    await client.join('sala-1')
    const ana = new FakeRemoteTrack()
    lastRoom().fire(RoomEvent.TrackSubscribed, ana, {}, { identity: 'ana', attributes: { accountId: 'acc-ana' } })
    expect(detector().watched.get('ana')?.()).toBe(ana.mediaStreamTrack)

    lastRoom().fire(RoomEvent.TrackUnsubscribed, ana, {}, { identity: 'ana' })
    expect(detector().watched.has('ana')).toBe(false)
  })

  it('o bot de música também acende; áudio da tela não conta como fala', async () => {
    await client.join('sala-1')
    lastRoom().fire(RoomEvent.TrackSubscribed, new FakeRemoteTrack(), {}, { identity: 'musica', attributes: { bot: 'music' } })
    const screenAudio = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.ScreenShareAudio)
    lastRoom().fire(RoomEvent.TrackSubscribed, screenAudio, {}, { identity: 'bia', attributes: { accountId: 'acc-bia' } })
    expect([...detector().watched.keys()].sort()).toEqual(['eu', 'musica'])
  })

  it('sair desliga a medição', async () => {
    await client.join('sala-1')
    const used = detector()
    client.leave()
    expect(used.destroyed).toBe(true)
  })

  it('vem da medição no app', async () => {
    await client.join('sala-1')
    detector().emit(['eu', 'outro'])
    expect(useApp.getState().speaking).toEqual({ eu: true, outro: true })
    detector().emit([])
    expect(useApp.getState().speaking).toEqual({})
  })

  it('mute esconde a própria pessoa; deafen esconde os outros', async () => {
    await client.join('sala-1')
    detector().emit(['eu', 'outro'])
    client.setMuted(true)
    expect(useApp.getState().speaking).toEqual({ outro: true })
    client.setMuted(false)
    client.setDeafened(true)
    expect(useApp.getState().speaking).toEqual({ eu: true })
  })

  it('não atualiza a store se nada mudou', async () => {
    await client.join('sala-1')
    detector().emit(['outro'])
    const before = useApp.getState().speaking
    detector().emit(['outro'])
    expect(useApp.getState().speaking).toBe(before)
  })

  it('sair limpa quem está falando', async () => {
    await client.join('sala-1')
    detector().emit(['outro'])
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
    await expect(new VoiceClient().stopScreenShare()).resolves.toBeUndefined()
  })

  it('a tela de quem compartilha aparece em store.screens e some quando acaba', async () => {
    await client.join('sala-1')
    const track = screenTrack()
    lastRoom().fire(RoomEvent.TrackSubscribed, track, {}, participant('ana'))
    expect(useApp.getState().screens).toEqual(['ana'])
    expect(track.attachedElements).toHaveLength(0)
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

describe('screenOwnerOf', () => {
  it('participante <conta>:screen é a tela da conta dita no metadata', () => {
    expect(screenOwnerOf('acc-ana:screen', JSON.stringify({ screenOf: 'acc-ana' }))).toBe('acc-ana')
  })

  it('sem metadata válido, a conta vem da identidade', () => {
    expect(screenOwnerOf('acc-ana:screen')).toBe('acc-ana')
    expect(screenOwnerOf('acc-ana:screen', 'não é json')).toBe('acc-ana')
    expect(screenOwnerOf('acc-ana:screen', JSON.stringify({ screenOf: 42 }))).toBe('acc-ana')
  })

  it('quem não termina em :screen não é tela de ninguém', () => {
    expect(screenOwnerOf('socket-ana', JSON.stringify({ screenOf: 'acc-ana' }))).toBeNull()
    expect(screenOwnerOf('music-bot:sala-1')).toBeNull()
    expect(screenOwnerOf(':screen')).toBeNull()
  })
})

describe('tela nativa (participante <conta>:screen)', () => {
  const ana = () => new FakeParticipant('sock-ana', { accountId: 'acc-ana' })
  const anaScreen = () => new FakeParticipant('acc-ana:screen', {}, JSON.stringify({ screenOf: 'acc-ana' }))
  const myScreen = () => new FakeParticipant('a:screen', {}, JSON.stringify({ screenOf: 'a' }))
  const screenVideo = () => new FakeRemoteTrack(Track.Kind.Video, Track.Source.ScreenShare)
  const screenAudio = () => new FakeRemoteTrack(Track.Kind.Audio, Track.Source.ScreenShareAudio)

  async function roomWithAna(): Promise<FakeRoom> {
    await client.join('sala-1')
    const room = lastRoom()
    room.remoteParticipants.set('sock-ana', ana())
    return room
  }

  it('a tela de outra pessoa aparece como a tela dela, ligável num <video>, e some quando acaba', async () => {
    const room = await roomWithAna()
    const video = screenVideo()
    room.fire(RoomEvent.TrackSubscribed, video, {}, anaScreen())
    expect(useApp.getState().screens).toEqual(['sock-ana'])
    const element = new FakeElement()
    client.attachScreen('sock-ana', element as unknown as HTMLVideoElement)
    expect(video.attachedElements).toEqual([element])
    room.remoteParticipants.delete('sock-ana')
    room.fire(RoomEvent.TrackUnsubscribed, video, {}, anaScreen())
    expect(useApp.getState().screens).toEqual([])
  })

  it('o áudio da tela nativa conta como áudio da tela da dona, com o volume da tela dela', async () => {
    const room = await roomWithAna()
    client.setScreenVolume('acc-ana', 0.4)
    const audio = screenAudio()
    room.fire(RoomEvent.TrackSubscribed, audio, {}, anaScreen())
    expect(useApp.getState().screenAudio).toEqual(['sock-ana'])
    expect(audio.setVolume).toHaveBeenLastCalledWith(0.4)
    client.setUserMuted('acc-ana', true)
    expect(audio.setVolume).toHaveBeenLastCalledWith(0.4)
    room.fire(RoomEvent.TrackUnsubscribed, audio, {}, anaScreen())
    expect(useApp.getState().screenAudio).toEqual([])
  })

  it('o participante da tela nunca é membro que fala: só tela e áudio da tela valem', async () => {
    const room = await roomWithAna()
    const microphone = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone)
    room.fire(RoomEvent.TrackSubscribed, microphone, {}, anaScreen())
    room.fire(RoomEvent.TrackSubscribed, new FakeRemoteTrack(Track.Kind.Video, Track.Source.Camera), {}, anaScreen())
    expect(detector().watched.has('acc-ana:screen')).toBe(false)
    expect(detector().watched.has('sock-ana')).toBe(false)
    expect(microphone.attachedElements).toEqual([])
    expect(useApp.getState().cameras).toEqual([])
    expect(useApp.getState().screens).toEqual([])
  })

  it('assina o que os outros publicam, inclusive quem já estava na sala, mas nunca a própria tela', async () => {
    const present = ana()
    const presentMicrophone = present.publish(Track.Source.Microphone)
    const mine = myScreen()
    const myScreenAtConnect = mine.publish(Track.Source.ScreenShare)
    const c = new VoiceClient({
      createRoom: () => {
        const room = new FakeRoom()
        room.remoteParticipants.set(present.identity, present)
        room.remoteParticipants.set(mine.identity, mine)
        rooms.push(room)
        return room as unknown as Room
      },
      createMicTrack: async () => (mic = new FakeMic()) as unknown as LocalAudioTrack
    })
    c.setSocket(socket.asSocket())
    await c.join('sala-1')
    expect(presentMicrophone.subscribed).toBe(true)
    expect(myScreenAtConnect.subscribed).toBe(false)

    const later = anaScreen().publish(Track.Source.ScreenShare)
    lastRoom().fire(RoomEvent.TrackPublished, later, anaScreen())
    const myLaterAudio = myScreen().publish(Track.Source.ScreenShareAudio)
    lastRoom().fire(RoomEvent.TrackPublished, myLaterAudio, myScreen())
    expect(later.subscribed).toBe(true)
    expect(myLaterAudio.subscribed).toBe(false)
  })

  it('a própria tela nativa aparece como a minha tela (miniatura) e some ao parar ou sair', async () => {
    await client.join('sala-1')
    client.showOwnScreen('data:image/png;base64,AAAA')
    expect(useApp.getState()).toMatchObject({ screens: ['eu'], ownScreenThumbnail: 'data:image/png;base64,AAAA' })
    client.showOwnScreen(null)
    expect(useApp.getState()).toMatchObject({ screens: [], ownScreenThumbnail: null })
    client.showOwnScreen('data:image/png;base64,AAAA')
    client.leave()
    expect(useApp.getState()).toMatchObject({ screens: [], ownScreenThumbnail: null })
  })
})

describe('dispositivos e volume (B4)', () => {
  const micOf = (accountId: string) => ({ identity: 'sock-' + accountId, attributes: { accountId } })
  let micDevices: (string | null)[]

  function deviceClient(opts: { failDevice?: string } = {}): VoiceClient {
    micDevices = []
    const c = new VoiceClient({
      createRoom: (o) => {
        const room = new FakeRoom(o)
        rooms.push(room)
        return room as unknown as Room
      },
      createMicTrack: async (deviceId) => {
        micDevices.push(deviceId)
        if (deviceId && deviceId === opts.failDevice) throw new DOMException('sumiu', 'OverconstrainedError')
        mic = new FakeMic()
        return mic as unknown as LocalAudioTrack
      },
      listDevices: async (kind) => [{ deviceId: kind, kind, label: kind, groupId: '' } as MediaDeviceInfo]
    })
    c.setSocket(socket.asSocket())
    return c
  }

  it('microfone escolhido fora da sala vale na próxima entrada', async () => {
    const c = deviceClient()
    await c.setInputDevice('mic-usb')
    expect(rooms).toHaveLength(0)
    await c.join('sala-1')
    expect(micDevices).toEqual(['mic-usb'])
  })

  it('microfone escolhido que sumiu: entra com o padrão do sistema', async () => {
    const c = deviceClient({ failDevice: 'mic-usb' })
    await c.setInputDevice('mic-usb')
    expect(await c.join('sala-1')).toEqual({ micError: null, cancelled: false, canSpeak: true, canShare: true, canVideo: true })
    expect(micDevices).toEqual(['mic-usb', null])
    expect(lastRoom().localParticipant.publishTrack).toHaveBeenCalled()
  })

  it('trocar o microfone dentro da sala troca na hora; null = padrão', async () => {
    const c = deviceClient()
    await c.join('sala-1')
    await c.setInputDevice('mic-2')
    expect(lastRoom().switchActiveDevice).toHaveBeenLastCalledWith('audioinput', 'mic-2')
    await c.setInputDevice(null)
    expect(lastRoom().switchActiveDevice).toHaveBeenLastCalledWith('audioinput', 'default')
  })

  it('sem microfone (só ouvindo), trocar não mexe na sala', async () => {
    micError = new DOMException('negado', 'NotAllowedError')
    await client.join('sala-1')
    await client.setInputDevice('mic-2')
    expect(lastRoom().switchActiveDevice).not.toHaveBeenCalled()
  })

  it('a saída escolhida vai para a sala nova e troca na hora dentro da sala', async () => {
    const c = deviceClient()
    await c.setOutputDevice('fone')
    await c.join('sala-1')
    expect(lastRoom().opts).toEqual({ outputDeviceId: 'fone' })
    await c.setOutputDevice(null)
    expect(lastRoom().switchActiveDevice).toHaveBeenLastCalledWith('audiooutput', 'default')
  })

  it('listDevices usa o LiveKit', async () => {
    const c = deviceClient()
    expect((await c.listDevices('audiooutput')).map((d) => d.deviceId)).toEqual(['audiooutput'])
  })

  it('volume por conta: aplicado ao chegar e na hora, só no microfone daquela pessoa', async () => {
    client.setUserVolume('acc-ana', 0.3)
    await client.join('sala-1')
    const ana = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone)
    const bia = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone)
    const anaScreen = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.ScreenShareAudio)
    lastRoom().fire(RoomEvent.TrackSubscribed, ana, {}, micOf('acc-ana'))
    lastRoom().fire(RoomEvent.TrackSubscribed, bia, {}, micOf('acc-bia'))
    lastRoom().fire(RoomEvent.TrackSubscribed, anaScreen, {}, micOf('acc-ana'))
    expect(ana.setVolume).toHaveBeenLastCalledWith(0.3)
    expect(bia.setVolume).toHaveBeenLastCalledWith(1)
    expect(anaScreen.setVolume).toHaveBeenLastCalledWith(1)

    client.setUserVolume('acc-bia', 0.5)
    expect(bia.setVolume).toHaveBeenLastCalledWith(0.5)
    client.setUserVolume('acc-ana', 1)
    expect(ana.setVolume).toHaveBeenLastCalledWith(1)
  })

  it('volume fora de 0–1 ou inválido é corrigido', async () => {
    await client.join('sala-1')
    const ana = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone)
    lastRoom().fire(RoomEvent.TrackSubscribed, ana, {}, micOf('acc-ana'))
    client.setUserVolume('acc-ana', 5)
    expect(ana.setVolume).toHaveBeenLastCalledWith(1)
    client.setUserVolume('acc-ana', -1)
    expect(ana.setVolume).toHaveBeenLastCalledWith(0)
    client.setUserVolume('acc-ana', Number.NaN)
    expect(ana.setVolume).toHaveBeenLastCalledWith(1)
  })

  it('quem saiu não recebe mais mudança de volume', async () => {
    await client.join('sala-1')
    const ana = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone)
    lastRoom().fire(RoomEvent.TrackSubscribed, ana, {}, micOf('acc-ana'))
    lastRoom().fire(RoomEvent.TrackUnsubscribed, ana, {}, micOf('acc-ana'))
    ana.setVolume.mockClear()
    client.setUserVolume('acc-ana', 0.2)
    expect(ana.setVolume).not.toHaveBeenCalled()
  })
})

describe('silenciar alguém só para mim', () => {
  const micOf = (accountId: string) => ({ identity: 'sock-' + accountId, attributes: { accountId } })

  it('silenciar zera o volume; voltar restaura o volume que estava ajustado', async () => {
    await client.join('sala-1')
    const ana = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone)
    lastRoom().fire(RoomEvent.TrackSubscribed, ana, {}, micOf('acc-ana'))
    client.setUserVolume('acc-ana', 0.4)
    client.setUserMuted('acc-ana', true)
    expect(ana.setVolume).toHaveBeenLastCalledWith(0)
    client.setUserVolume('acc-ana', 0.6)
    expect(ana.setVolume).toHaveBeenLastCalledWith(0)
    client.setUserMuted('acc-ana', false)
    expect(ana.setVolume).toHaveBeenLastCalledWith(0.6)
  })

  it('quem já estava silenciado chega mudo', async () => {
    client.setUserMuted('acc-ana', true)
    await client.join('sala-1')
    const ana = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone)
    lastRoom().fire(RoomEvent.TrackSubscribed, ana, {}, micOf('acc-ana'))
    expect(ana.setVolume).toHaveBeenLastCalledWith(0)
  })

  it('bot de música: volume e silenciar valem na faixa dele como os de uma pessoa', async () => {
    client.setUserVolume(MUSIC_BOT_VOLUME_ID, 0.3)
    await client.join('sala-1')
    const bot = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone)
    lastRoom().fire(RoomEvent.TrackSubscribed, bot, {}, { identity: 'music-bot:sala-1', attributes: { bot: 'music' } })
    expect(bot.setVolume).toHaveBeenLastCalledWith(0.3)
    client.setUserMuted(MUSIC_BOT_VOLUME_ID, true)
    expect(bot.setVolume).toHaveBeenLastCalledWith(0)
    client.setUserMuted(MUSIC_BOT_VOLUME_ID, false)
    client.setUserVolume(MUSIC_BOT_VOLUME_ID, 0.7)
    expect(bot.setVolume).toHaveBeenLastCalledWith(0.7)
  })

  it('silenciar uma pessoa não mexe nas outras', async () => {
    await client.join('sala-1')
    const ana = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone)
    const bia = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone)
    lastRoom().fire(RoomEvent.TrackSubscribed, ana, {}, micOf('acc-ana'))
    lastRoom().fire(RoomEvent.TrackSubscribed, bia, {}, micOf('acc-bia'))
    bia.setVolume.mockClear()
    client.setUserMuted('acc-ana', true)
    expect(bia.setVolume).not.toHaveBeenCalled()
  })
})

describe('supressão de ruído automática (B13)', () => {
  let micOpts: ({ noiseSuppression: boolean } | undefined)[]
  let processors: { onMode: (m: 'light' | 'advanced' | 'light-fallback') => void }[]
  let contexts: { close: ReturnType<typeof vi.fn> }[]
  let watchdogs: { ctx: unknown; stop: ReturnType<typeof vi.fn> }[]
  let modes: (string | null)[]

  function noiseClient(opts: { processorFails?: boolean } = {}): VoiceClient {
    micOpts = []
    processors = []
    contexts = []
    watchdogs = []
    modes = []
    const c = new VoiceClient({
      createRoom: () => {
        const room = new FakeRoom()
        rooms.push(room)
        return room as unknown as Room
      },
      createMicTrack: async (_deviceId, o) => {
        micOpts.push(o)
        mic = new FakeMic()
        mic.nativeSuppression = o?.noiseSuppression !== false
        if (opts.processorFails) mic.setProcessor.mockRejectedValue(new Error('WASM bloqueado'))
        return mic as unknown as LocalAudioTrack
      },
      createAudioContext: () => {
        const ctx = { close: vi.fn(async () => {}) }
        contexts.push(ctx)
        return ctx as unknown as AudioContext
      },
      createClockWatchdog: (ctx) => {
        const w = { ctx, stop: vi.fn() }
        watchdogs.push(w)
        return w
      },
      createNoiseProcessor: (onMode) => {
        const p = { onMode }
        processors.push(p)
        return p as never
      }
    })
    c.onNoiseModeChange = (m) => modes.push(m)
    c.setSocket(socket.asSocket())
    return c
  }

  it('liga o filtro no microfone antes de publicar, com AudioContext próprio', async () => {
    const c = noiseClient()
    await c.join('sala-1')
    expect(micOpts).toEqual([{ noiseSuppression: true }])
    expect(mic!.setAudioContext).toHaveBeenCalled()
    expect(mic!.setProcessor).toHaveBeenCalledWith(processors[0])
    const setOrder = mic!.setProcessor.mock.invocationCallOrder[0]
    const publishOrder = lastRoom().localParticipant.publishTrack.mock.invocationCallOrder[0]
    expect(setOrder).toBeLessThan(publishOrder)
  })

  it('o modo informado pelo processador chega a quem escuta (store)', async () => {
    const c = noiseClient()
    await c.join('sala-1')
    processors[0].onMode('advanced')
    expect(modes).toContain('advanced')
  })

  it('cada entrada usa um AudioContext novo e fecha o anterior (sair e entrar recomeça o áudio)', async () => {
    const c = noiseClient()
    await c.join('sala-1')
    await c.join('sala-2')
    expect(contexts).toHaveLength(2)
    expect(contexts[0].close).toHaveBeenCalled()
    expect(contexts[1].close).not.toHaveBeenCalled()
    expect(processors).toHaveLength(2)
  })

  it('o relógio do AudioContext fica vigiado enquanto está na sala', async () => {
    const c = noiseClient()
    await c.join('sala-1')
    expect(watchdogs).toHaveLength(1)
    expect(watchdogs[0].ctx).toBe(contexts[0])
    c.leave()
    expect(watchdogs[0].stop).toHaveBeenCalled()
    expect(contexts[0].close).toHaveBeenCalled()
  })

  it('desligar e ligar a supressão na sala reaproveita o mesmo AudioContext e o mesmo vigia', async () => {
    const c = noiseClient()
    await c.join('sala-1')
    await c.setNoiseSuppression(false)
    await c.setNoiseSuppression(true)
    expect(contexts).toHaveLength(1)
    expect(watchdogs).toHaveLength(1)
  })

  it('se o filtro não liga, entra mesmo assim com a supressão nativa', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = noiseClient({ processorFails: true })
    expect(await c.join('sala-1')).toEqual({ micError: null, cancelled: false, canSpeak: true, canShare: true, canVideo: true })
    expect(lastRoom().localParticipant.publishTrack).toHaveBeenCalled()
    expect(modes).toContain('light-fallback')
    warn.mockRestore()
  })

  it('desligado antes de entrar: microfone cru (sem nativa e sem processador)', async () => {
    const c = noiseClient()
    await c.setNoiseSuppression(false)
    await c.join('sala-1')
    expect(micOpts).toEqual([{ noiseSuppression: false }])
    expect(mic!.setProcessor).not.toHaveBeenCalled()
  })

  it('desligar dentro da sala reabre a captura sem a nativa (o Chromium ignora applyConstraints); ligar devolve', async () => {
    const c = noiseClient()
    await c.join('sala-1')
    await c.setNoiseSuppression(false)
    expect(mic!.stopProcessor).toHaveBeenCalled()
    expect(mic!.nativeSuppression).toBe(false)
    expect(modes.at(-1)).toBe('off')
    await c.setNoiseSuppression(true)
    expect(mic!.nativeSuppression).toBe(true)
    expect(mic!.setProcessor).toHaveBeenCalledTimes(2)
  })

  it('entrou com a supressão desligada e liga na sala: a captura ganha a nativa', async () => {
    const c = noiseClient()
    await c.setNoiseSuppression(false)
    await c.join('sala-1')
    await c.setNoiseSuppression(true)
    expect(mic!.nativeSuppression).toBe(true)
    expect(mic!.setProcessor).toHaveBeenCalledTimes(1)
  })

  it('reabrir a captura mantém o microfone escolhido e a captura de voz', async () => {
    const c = noiseClient()
    await c.setInputDevice('mic-usb')
    await c.join('sala-1')
    await c.setNoiseSuppression(false)
    expect(mic!.restartTrack).toHaveBeenLastCalledWith({
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: true,
      deviceId: 'mic-usb'
    })
  })

  it('microfone que não reabre: avisa no console e a troca não quebra', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const c = noiseClient()
    await c.join('sala-1')
    mic!.restartTrack.mockRejectedValue(new DOMException('sumiu', 'NotFoundError'))
    await expect(c.setNoiseSuppression(false)).resolves.toBeUndefined()
    expect(modes.at(-1)).toBe('off')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[ruído]'), expect.anything())
    warn.mockRestore()
  })

  it('sem microfone (só ouvindo) não tenta ligar nada', async () => {
    const c = noiseClient()
    const failing = new VoiceClient({
      createRoom: () => {
        const room = new FakeRoom()
        rooms.push(room)
        return room as unknown as Room
      },
      createMicTrack: async () => {
        throw new DOMException('negado', 'NotAllowedError')
      },
      createNoiseProcessor: () => {
        throw new Error('não deveria criar')
      }
    })
    failing.setSocket(socket.asSocket())
    await expect(failing.join('sala-1')).resolves.toMatchObject({ micError: expect.anything() })
    await expect(failing.setNoiseSuppression(false)).resolves.toBeUndefined()
    expect(c).toBeTruthy()
  })

  it('sair avisa que a supressão parou (fora de sala)', async () => {
    const c = noiseClient()
    await c.join('sala-1')
    c.leave()
    expect(modes.at(-1)).toBeNull()
  })
})

describe('revisão do #9: entrada cancelada e troca de sala que falha', () => {
  it('troca recusada pelo servidor: a sala atual continua de pé e o servidor não recebe voice:leave', async () => {
    await client.join('sala-1')
    const first = lastRoom()
    const firstMic = mic!
    socket.replyTo('voice:join', () => ({ ok: false, error: 'Canal de voz não encontrado' }))
    await expect(client.join('sala-2')).rejects.toThrow('Canal de voz não encontrado')
    expect(first.disconnect).not.toHaveBeenCalled()
    expect(firstMic.stop).not.toHaveBeenCalled()
    expect(mic).not.toBe(firstMic)
    expect(mic!.stop).toHaveBeenCalled()
    expect(rooms).toHaveLength(1)
    expect(client.inRoom).toBe(true)
    expect(socket.sent('voice:leave')).toHaveLength(0)
  })

  it('a sala antiga só fecha depois que o servidor aceita a nova', async () => {
    await client.join('sala-1')
    const first = lastRoom()
    let answer: (r: JoinVoiceResult) => void = () => {}
    socket.replyTo('voice:join', () => new Promise<JoinVoiceResult>((res) => (answer = res)))
    const switching = client.join('sala-2')
    await vi.waitFor(() => expect(socket.sent('voice:join')).toHaveLength(2))
    expect(first.disconnect).not.toHaveBeenCalled()
    answer(CREDS)
    await switching
    expect(first.disconnect).toHaveBeenCalled()
  })

  it('LiveKit fora do ar ao entrar: a mensagem é a do LiveKit, não a de "queda", mesmo se vier Disconnected', async () => {
    const dropped = vi.fn()
    const c = new VoiceClient({
      createRoom: () => {
        const room = new FakeRoom()
        room.connect.mockImplementation(async () => {
          room.fire(RoomEvent.Disconnected, DisconnectReason.UNKNOWN_REASON)
          throw new Error('could not establish signal connection')
        })
        rooms.push(room)
        return room as unknown as Room
      },
      createMicTrack: async () => (mic = new FakeMic()) as unknown as LocalAudioTrack
    })
    c.onUnexpectedDisconnect = dropped
    c.setSocket(socket.asSocket())
    await expect(c.join('sala-1')).rejects.toThrow('Confira se o LiveKit está rodando')
    expect(dropped).not.toHaveBeenCalled()
    expect(socket.sent('voice:leave')).toHaveLength(1)
    expect(c.inRoom).toBe(false)
  })

  it('conexão com o Concord cai durante a entrada: devolve cancelled e não publica nada', async () => {
    let finishConnect: () => void = () => {}
    const c = new VoiceClient({
      createRoom: () => {
        const room = new FakeRoom()
        room.connect.mockImplementation(() => new Promise<void>((res) => (finishConnect = res)))
        rooms.push(room)
        return room as unknown as Room
      },
      createMicTrack: async () => (mic = new FakeMic()) as unknown as LocalAudioTrack
    })
    c.setSocket(socket.asSocket())
    const joining = c.join('sala-1')
    await vi.waitFor(() => expect(rooms).toHaveLength(1))
    c.teardown()
    finishConnect()
    await expect(joining).resolves.toEqual({ micError: null, cancelled: true, canSpeak: true, canShare: true, canVideo: true })
    expect(lastRoom().localParticipant.publishTrack).not.toHaveBeenCalled()
    expect(c.inRoom).toBe(false)
  })

  it('depois de conectado, Disconnected volta a ser "queda" normalmente', async () => {
    const dropped = vi.fn()
    client.onUnexpectedDisconnect = dropped
    await client.join('sala-1')
    lastRoom().fire(RoomEvent.Disconnected, DisconnectReason.SERVER_SHUTDOWN)
    expect(dropped).toHaveBeenCalled()
  })
})

describe('permissões de voz (v2): speak e share', () => {
  it('sem speak entra só ouvindo: não publica o microfone (o LiveKit recusaria com 403)', async () => {
    socket.replyTo('voice:join', () => ({ ...CREDS, canSpeak: false, canShare: true, canVideo: true }))
    const res = await client.join('sala-1')
    expect(res).toEqual({ micError: null, cancelled: false, canSpeak: false, canShare: true, canVideo: true })
    expect(mic!.stop).toHaveBeenCalled()
    expect(lastRoom().localParticipant.publishTrack).not.toHaveBeenCalled()
    expect(client.currentPermissions).toEqual({ canSpeak: false, canShare: true, canVideo: true })
  })

  it('servidor antigo (sem os campos) = pode tudo', async () => {
    expect(await client.join('sala-1')).toMatchObject({ canSpeak: true, canShare: true, canVideo: true })
    expect(lastRoom().localParticipant.publishTrack).toHaveBeenCalled()
  })

  it('perder speak na sala: tira e libera o microfone e avisa o app', async () => {
    const changed = vi.fn()
    client.onPermissionsChange = changed
    await client.join('sala-1')
    const room = lastRoom()
    const firstMic = mic!
    room.localParticipant.permissions = { canPublish: true, canPublishSources: [1, 3] }
    room.fire(RoomEvent.ParticipantPermissionsChanged, {}, room.localParticipant)
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith({ canSpeak: false, canShare: true, canVideo: true }))
    expect(room.localParticipant.unpublishTrack).toHaveBeenCalledWith(firstMic)
    expect(firstMic.stop).toHaveBeenCalled()
  })

  it('recuperar speak: abre o microfone de novo (mudo se estava mudo) e publica', async () => {
    socket.replyTo('voice:join', () => ({ ...CREDS, canSpeak: false, canShare: false, canVideo: true }))
    const changed = vi.fn()
    client.onPermissionsChange = changed
    client.setMuted(true)
    await client.join('sala-1')
    const room = lastRoom()
    room.localParticipant.permissions = { canPublish: true, canPublishSources: [1, 2] }
    room.fire(RoomEvent.ParticipantPermissionsChanged, {}, room.localParticipant)
    await vi.waitFor(() => expect(changed).toHaveBeenCalledWith({ canSpeak: true, canShare: false, canVideo: true }))
    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(mic, { source: Track.Source.Microphone, forceStereo: false })
    expect(mic!.mute).toHaveBeenCalled()
  })

  it('permissões de outra pessoa e mudança que não muda nada são ignoradas', async () => {
    const changed = vi.fn()
    client.onPermissionsChange = changed
    await client.join('sala-1')
    const room = lastRoom()
    room.fire(RoomEvent.ParticipantPermissionsChanged, {}, room.localParticipant)
    room.localParticipant.permissions = { canPublish: true, canPublishSources: [1, 3] }
    room.fire(RoomEvent.ParticipantPermissionsChanged, {}, { identity: 'ana' })
    await new Promise((r) => setTimeout(r, 10))
    expect(changed).not.toHaveBeenCalled()
  })

  it('sair volta às permissões padrão', async () => {
    socket.replyTo('voice:join', () => ({ ...CREDS, canSpeak: false, canShare: false, canVideo: true }))
    await client.join('sala-1')
    client.leave()
    socket.replyTo('voice:join', () => CREDS)
    expect(await client.join('sala-2')).toMatchObject({ canSpeak: true, canShare: true, canVideo: true })
  })
})

describe('bug: trocar de sala aparecia "removido" e não entrava', () => {
  function kickOldRoomOnJoin(oldRoom: () => FakeRoom): void {
    socket.replyTo('voice:join', () => {
      oldRoom().fire(RoomEvent.Disconnected, DisconnectReason.PARTICIPANT_REMOVED)
      return CREDS
    })
  }

  it('o "removido" da sala antiga durante a troca é esperado: entra na nova, sem aviso e sem voice:leave', async () => {
    const dropped = vi.fn()
    client.onUnexpectedDisconnect = dropped
    await client.join('sala-1')
    const first = lastRoom()
    kickOldRoomOnJoin(() => first)
    const res = await client.join('sala-2')
    expect(res).toMatchObject({ cancelled: false })
    expect(dropped).not.toHaveBeenCalled()
    expect(socket.sent('voice:leave')).toHaveLength(0)
    expect(rooms).toHaveLength(2)
    expect(lastRoom().connect).toHaveBeenCalled()
    expect(client.inRoom).toBe(true)
  })

  it('o kick chegando depois da resposta (já fechada a antiga) também não atrapalha', async () => {
    const dropped = vi.fn()
    client.onUnexpectedDisconnect = dropped
    await client.join('sala-1')
    const first = lastRoom()
    const handlers = first.listeners.get(RoomEvent.Disconnected) ?? []
    await client.join('sala-2')
    for (const fn of handlers) fn(DisconnectReason.PARTICIPANT_REMOVED)
    expect(dropped).not.toHaveBeenCalled()
    expect(client.inRoom).toBe(true)
  })

  it('troca recusada e a sala antiga caiu no meio: aí sim é queda (sai e avisa)', async () => {
    const dropped = vi.fn()
    client.onUnexpectedDisconnect = dropped
    await client.join('sala-1')
    const first = lastRoom()
    socket.replyTo('voice:join', () => {
      first.fire(RoomEvent.Disconnected, DisconnectReason.UNKNOWN_REASON)
      return { ok: false, error: 'Canal de voz não encontrado' }
    })
    await expect(client.join('sala-2')).rejects.toThrow('Canal de voz não encontrado')
    expect(dropped).toHaveBeenCalledWith('A conexão com o servidor de voz caiu.')
    expect(client.inRoom).toBe(false)
  })

  it('troca recusada sem queda: continua na antiga', async () => {
    const dropped = vi.fn()
    client.onUnexpectedDisconnect = dropped
    await client.join('sala-1')
    socket.replyTo('voice:join', () => ({ ok: false, error: 'Canal de voz não encontrado' }))
    await expect(client.join('sala-2')).rejects.toThrow()
    expect(dropped).not.toHaveBeenCalled()
    expect(client.inRoom).toBe(true)
  })

  it('fora de uma troca, ser removido continua avisando', async () => {
    const dropped = vi.fn()
    client.onUnexpectedDisconnect = dropped
    await client.join('sala-1')
    lastRoom().fire(RoomEvent.Disconnected, DisconnectReason.PARTICIPANT_REMOVED)
    expect(dropped).toHaveBeenCalledWith('Você foi removido da sala de voz.')
  })
})

describe('câmera (B21)', () => {
  const cameraTrack = (): FakeRemoteTrack => new FakeRemoteTrack(Track.Kind.Video, Track.Source.Camera)

  it('liga a câmera com qualidade limitada (360p, sem simulcast) e desliga', async () => {
    await client.join('sala-1')
    await client.setCamera(true)
    expect(lastRoom().localParticipant.setCameraEnabled).toHaveBeenCalledWith(
      true,
      { resolution: { width: 640, height: 360, frameRate: 24 } },
      expect.objectContaining({ simulcast: false, videoEncoding: expect.objectContaining({ maxBitrate: 350_000 }) })
    )
    await client.setCamera(false)
    expect(lastRoom().localParticipant.setCameraEnabled).toHaveBeenLastCalledWith(false, undefined, undefined)
  })

  it('usa a câmera escolhida; trocar com ela ligada troca na hora', async () => {
    await client.setCameraDevice('cam-usb')
    await client.join('sala-1')
    await client.setCamera(true)
    expect(lastRoom().localParticipant.setCameraEnabled).toHaveBeenCalledWith(true, expect.objectContaining({ deviceId: 'cam-usb' }), expect.anything())
    expect(lastRoom().switchActiveDevice).not.toHaveBeenCalled()
    lastRoom().fire(RoomEvent.LocalTrackPublished, { source: Track.Source.Camera, track: cameraTrack() }, { identity: 'eu' })
    await client.setCameraDevice(null)
    expect(lastRoom().switchActiveDevice).toHaveBeenCalledWith('videoinput', 'default')
  })

  it('fora da sala ou sem a permissão video não liga', async () => {
    await expect(client.setCamera(true)).rejects.toThrow('Entre numa sala de voz')
    await expect(client.setCamera(false)).resolves.toBeUndefined()
    socket.replyTo('voice:join', () => ({ ...CREDS, canVideo: false }))
    expect(await client.join('sala-1')).toMatchObject({ canVideo: false })
    await expect(client.setCamera(true)).rejects.toThrow('permissão')
    expect(lastRoom().localParticipant.setCameraEnabled).not.toHaveBeenCalled()
  })

  it('câmeras da sala (a minha inclusa) aparecem em store.cameras e somem ao parar ou sair', async () => {
    await client.join('sala-1')
    const ana = cameraTrack()
    lastRoom().fire(RoomEvent.TrackSubscribed, ana, {}, { identity: 'ana' })
    const mine = cameraTrack()
    lastRoom().fire(RoomEvent.LocalTrackPublished, { source: Track.Source.Camera, track: mine }, { identity: 'eu' })
    expect(useApp.getState().cameras).toEqual(['ana', 'eu'])
    expect(useApp.getState().screens).toEqual([])

    const el = {} as HTMLVideoElement
    const detach = client.attachCamera('ana', el)
    expect(ana.attachedElements).toEqual([el])
    detach()
    expect(ana.detachOne).toHaveBeenCalledWith(el)
    expect(client.attachCamera('ninguém', el)).toBeInstanceOf(Function)

    lastRoom().fire(RoomEvent.TrackUnsubscribed, ana, {}, { identity: 'ana' })
    expect(useApp.getState().cameras).toEqual(['eu'])
    client.leave()
    expect(useApp.getState().cameras).toEqual([])
  })

  it('a própria câmera parar sem o botão (perdeu video) avisa o app', async () => {
    const ended = vi.fn()
    client.onCameraEnded = ended
    await client.join('sala-1')
    const mine = cameraTrack()
    lastRoom().fire(RoomEvent.LocalTrackPublished, { source: Track.Source.Camera, track: mine }, { identity: 'eu' })
    lastRoom().fire(RoomEvent.LocalTrackUnpublished, { source: Track.Source.Camera, track: mine }, { identity: 'eu' })
    expect(ended).toHaveBeenCalledOnce()
    expect(useApp.getState().cameras).toEqual([])
  })

  it('perder video na sala avisa as permissões novas', async () => {
    const changed = vi.fn()
    client.onPermissionsChange = changed
    await client.join('sala-1')
    const room = lastRoom()
    room.localParticipant.permissions = { canPublish: true, canPublishSources: [2, 3] }
    room.fire(RoomEvent.ParticipantPermissionsChanged, {}, room.localParticipant)
    await new Promise((r) => setTimeout(r, 10))
    expect(changed).toHaveBeenCalledWith({ canSpeak: true, canShare: true, canVideo: false })
  })
})

describe('pressione para falar (B20)', () => {
  it('portão fechado: entra com o microfone mudo, mas avisa o servidor como não silenciado', async () => {
    client.setMicGate(false)
    await client.join('sala-1')
    expect(mic!.mute).toHaveBeenCalled()
    expect(socket.sent('voice:join')[0][0]).toMatchObject({ muted: false })
  })

  it('abrir e fechar o portão liga e desliga o microfone e o "falando" da própria pessoa', async () => {
    await client.join('sala-1')
    detector().emit(['eu', 'outro'])
    client.setMicGate(false)
    expect(mic!.mute).toHaveBeenCalled()
    expect(useApp.getState().speaking).toEqual({ outro: true })
    client.setMicGate(true)
    expect(mic!.unmute).toHaveBeenCalled()
    expect(useApp.getState().speaking).toEqual({ eu: true, outro: true })
  })

  it('silenciado continua mudo mesmo com a tecla pressionada', async () => {
    await client.join('sala-1')
    client.setMuted(true)
    mic!.unmute.mockClear()
    client.setMicGate(true)
    expect(mic!.unmute).not.toHaveBeenCalled()
  })
})

describe('volume do microfone e de saída', () => {
  const micOf = (accountId: string) => ({ identity: 'sock-' + accountId, attributes: { accountId } })
  type FakeGainProc = { gain: number; setGain: ReturnType<typeof vi.fn> }
  let noiseProcs: FakeGainProc[]
  let gainProcs: FakeGainProc[]

  function volumeClient(): VoiceClient {
    noiseProcs = []
    gainProcs = []
    const c = new VoiceClient({
      createRoom: () => {
        const room = new FakeRoom()
        rooms.push(room)
        return room as unknown as Room
      },
      createMicTrack: async () => {
        mic = new FakeMic()
        return mic as unknown as LocalAudioTrack
      },
      createAudioContext: () => ({ close: vi.fn(async () => {}) }) as unknown as AudioContext,
      createClockWatchdog: () => ({ stop: vi.fn() }),
      createNoiseProcessor: (_onMode, gain) => {
        const p = { gain, setGain: vi.fn() }
        noiseProcs.push(p)
        return p as never
      },
      createGainProcessor: (gain) => {
        const p = { gain, setGain: vi.fn() }
        gainProcs.push(p)
        return p as never
      }
    })
    c.setSocket(socket.asSocket())
    return c
  }

  it('com a supressão ligada, o volume entra no processador de ruído (ao entrar e na hora)', async () => {
    const c = volumeClient()
    await c.setMicGain(1.5)
    await c.join('sala-1')
    expect(noiseProcs[0].gain).toBe(1.5)
    expect(gainProcs).toHaveLength(0)
    await c.setMicGain(0.5)
    expect(noiseProcs[0].setGain).toHaveBeenLastCalledWith(0.5)
  })

  it('supressão desligada em 100%: microfone cru; mudar o volume dentro da sala põe o processador de volume', async () => {
    const c = volumeClient()
    await c.setNoiseSuppression(false)
    await c.join('sala-1')
    expect(mic!.setProcessor).not.toHaveBeenCalled()
    await c.setMicGain(1.8)
    expect(gainProcs).toHaveLength(1)
    expect(gainProcs[0].gain).toBe(1.8)
    expect(mic!.setProcessor).toHaveBeenCalledWith(gainProcs[0])
    await c.setMicGain(1)
    expect(gainProcs[0].setGain).toHaveBeenLastCalledWith(1)
    expect(gainProcs).toHaveLength(1)
  })

  it('supressão desligada com volume ajustado: o processador de volume entra antes de publicar', async () => {
    const c = volumeClient()
    await c.setNoiseSuppression(false)
    await c.setMicGain(0.4)
    await c.join('sala-1')
    expect(gainProcs[0].gain).toBe(0.4)
    expect(mic!.setProcessor.mock.invocationCallOrder[0]).toBeLessThan(lastRoom().localParticipant.publishTrack.mock.invocationCallOrder[0])
  })

  it('desligar a supressão dentro da sala mantém o volume (troca pelo processador de volume)', async () => {
    const c = volumeClient()
    await c.setMicGain(1.2)
    await c.join('sala-1')
    await c.setNoiseSuppression(false)
    expect(mic!.stopProcessor).toHaveBeenCalled()
    expect(gainProcs[0].gain).toBe(1.2)
  })

  it('volume do microfone fora de 0–200% ou inválido é corrigido', async () => {
    const c = volumeClient()
    await c.setMicGain(9)
    await c.join('sala-1')
    expect(noiseProcs[0].gain).toBe(2)
    await c.setMicGain(-1)
    expect(noiseProcs[0].setGain).toHaveBeenLastCalledWith(0)
    await c.setMicGain(Number.NaN)
    expect(noiseProcs[0].setGain).toHaveBeenLastCalledWith(1)
  })

  it('fora da sala, mudar o volume do microfone não abre nada', async () => {
    const c = volumeClient()
    await c.setNoiseSuppression(false)
    await c.setMicGain(1.5)
    expect(gainProcs).toHaveLength(0)
    expect(mic).toBeNull()
  })

  it('volume de saída multiplica o volume de cada pessoa e vale para o áudio da tela', async () => {
    client.setUserVolume('acc-ana', 0.5)
    client.setOutputVolume(0.6)
    await client.join('sala-1')
    const ana = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone)
    const bia = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone)
    const tela = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.ScreenShareAudio)
    lastRoom().fire(RoomEvent.TrackSubscribed, ana, {}, micOf('acc-ana'))
    lastRoom().fire(RoomEvent.TrackSubscribed, bia, {}, micOf('acc-bia'))
    lastRoom().fire(RoomEvent.TrackSubscribed, tela, {}, micOf('acc-ana'))
    expect(ana.setVolume).toHaveBeenLastCalledWith(0.3)
    expect(bia.setVolume).toHaveBeenLastCalledWith(0.6)
    expect(tela.setVolume).toHaveBeenLastCalledWith(0.6)

    client.setOutputVolume(1)
    expect(ana.setVolume).toHaveBeenLastCalledWith(0.5)
    expect(bia.setVolume).toHaveBeenLastCalledWith(1)
    expect(tela.setVolume).toHaveBeenLastCalledWith(1)

    client.setUserMuted('acc-bia', true)
    client.setOutputVolume(0.8)
    expect(bia.setVolume).toHaveBeenLastCalledWith(0)
  })

  it('volume de saída fora de 0–100% é corrigido', async () => {
    await client.join('sala-1')
    const ana = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone)
    lastRoom().fire(RoomEvent.TrackSubscribed, ana, {}, micOf('acc-ana'))
    client.setOutputVolume(3)
    expect(ana.setVolume).toHaveBeenLastCalledWith(1)
    client.setOutputVolume(-2)
    expect(ana.setVolume).toHaveBeenLastCalledWith(0)
  })
})

describe('câmera desligada e religada (B21)', () => {
  const cameraTrack = (muted = false): FakeRemoteTrack => Object.assign(new FakeRemoteTrack(Track.Kind.Video, Track.Source.Camera), { isMuted: muted })
  const pub = (track: FakeRemoteTrack) => ({ source: Track.Source.Camera, track })

  it('desligar silencia a faixa (não despublica): sai de store.cameras; religar volta', async () => {
    await client.join('sala-1')
    const mine = cameraTrack()
    lastRoom().fire(RoomEvent.LocalTrackPublished, pub(mine), { identity: 'eu' })
    const ana = cameraTrack()
    lastRoom().fire(RoomEvent.TrackSubscribed, ana, {}, { identity: 'ana' })
    expect(useApp.getState().cameras).toEqual(['eu', 'ana'])

    lastRoom().fire(RoomEvent.TrackMuted, pub(mine), { identity: 'eu' })
    lastRoom().fire(RoomEvent.TrackMuted, pub(ana), { identity: 'ana' })
    expect(useApp.getState().cameras).toEqual([])

    lastRoom().fire(RoomEvent.TrackUnmuted, pub(ana), { identity: 'ana' })
    expect(useApp.getState().cameras).toEqual(['ana'])
  })

  it('quem entra depois não vê a câmera de quem está com ela desligada', async () => {
    await client.join('sala-1')
    lastRoom().fire(RoomEvent.TrackSubscribed, cameraTrack(true), {}, { identity: 'ana' })
    expect(useApp.getState().cameras).toEqual([])
  })

  it('silenciar o microfone não mexe nas câmeras', async () => {
    await client.join('sala-1')
    lastRoom().fire(RoomEvent.TrackSubscribed, cameraTrack(), {}, { identity: 'ana' })
    lastRoom().fire(RoomEvent.TrackMuted, { source: Track.Source.Microphone, track: new FakeRemoteTrack() }, { identity: 'ana' })
    expect(useApp.getState().cameras).toEqual(['ana'])
  })
})

describe('syncPermissions (fim do silêncio do moderador)', () => {
  it('relê as permissões da sala: voltou o speak, abre e publica o microfone sem esperar o evento do LiveKit', async () => {
    socket.replyTo('voice:join', () => ({ ...CREDS, canSpeak: false }))
    const changed = vi.fn()
    client.onPermissionsChange = changed
    await client.join('sala-1')
    const room = lastRoom()
    expect(room.localParticipant.publishTrack).not.toHaveBeenCalled()
    room.localParticipant.permissions = { canPublish: true, canPublishSources: [1, 2, 3] }
    await client.syncPermissions()
    expect(room.localParticipant.publishTrack).toHaveBeenCalledWith(mic, { source: Track.Source.Microphone, forceStereo: false })
    expect(changed).toHaveBeenCalledWith({ canSpeak: true, canShare: true, canVideo: true })
  })

  it('sem mudança, ou fora da sala, não faz nada', async () => {
    await expect(client.syncPermissions()).resolves.toBeUndefined()
    const changed = vi.fn()
    client.onPermissionsChange = changed
    await client.join('sala-1')
    await client.syncPermissions()
    expect(changed).not.toHaveBeenCalled()
    expect(lastRoom().localParticipant.publishTrack).toHaveBeenCalledTimes(1)
  })
})

describe('microfone publicado em mono', () => {
  it('nunca publica em estéreo, mesmo com microfone de dois canais (mantém RED e DTX)', async () => {
    await client.join('sala-1')
    expect(lastRoom().localParticipant.publishTrack).toHaveBeenCalledWith(mic, expect.objectContaining({ forceStereo: false }))
  })
})

describe('equalizador automático', () => {
  const micOf = (accountId: string) => ({ identity: 'sock-' + accountId, attributes: { accountId } })

  class FakeLeveler {
    onGainsChange: ((gains: Record<string, number>) => void) | null = null
    voices = new Map<object, { accountId: string; track: unknown; volume: number }>()
    target = 'medium'
    output: string | null = null
    destroyed = 0
    add(key: object, accountId: string, track: unknown, volume = 1): void {
      this.voices.set(key, { accountId, track, volume })
    }
    remove(key: object): void {
      this.voices.delete(key)
    }
    setVolume(key: object, volume: number): void {
      const v = this.voices.get(key)
      if (v) v.volume = volume
    }
    setTarget(target: string): void {
      this.target = target
    }
    setOutput(id: string | null): void {
      this.output = id
    }
    destroy(): void {
      this.voices.clear()
      this.destroyed++
    }
  }

  let levelers: FakeLeveler[]
  const leveler = (): FakeLeveler => levelers[levelers.length - 1]

  function levelerClient(): VoiceClient {
    levelers = []
    const c = new VoiceClient({
      createRoom: () => {
        const room = new FakeRoom()
        rooms.push(room)
        return room as unknown as Room
      },
      createMicTrack: async () => {
        mic = new FakeMic()
        return mic as unknown as LocalAudioTrack
      },
      createLeveler: () => {
        const l = new FakeLeveler()
        levelers.push(l)
        return l as unknown as VoiceLeveler
      }
    })
    c.setSocket(socket.asSocket())
    return c
  }

  const subscribe = (accountId: string, source = Track.Source.Microphone): FakeRemoteTrack => {
    const track = new FakeRemoteTrack(Track.Kind.Audio, source)
    lastRoom().fire(RoomEvent.TrackSubscribed, track, {}, micOf(accountId))
    return track
  }

  it('desligado (padrão): nada passa pelo equalizador', async () => {
    const c = levelerClient()
    await c.join('sala-1')
    const ana = subscribe('acc-ana')
    expect(levelers).toHaveLength(0)
    expect(ana.attachedElements[0].muted).toBe(false)
    expect(ana.setVolume).toHaveBeenLastCalledWith(1)
  })

  it('ligado: o microfone de cada um vai para o equalizador com o elemento mudo e o volume combinado', async () => {
    const c = levelerClient()
    c.setLeveler(true)
    c.setUserVolume('acc-ana', 0.5)
    c.setOutputVolume(0.8)
    await c.join('sala-1')
    const ana = subscribe('acc-ana')
    expect(ana.attachedElements[0].muted).toBe(true)
    expect(ana.setVolume).not.toHaveBeenCalled()
    expect(leveler().voices.get(ana)).toEqual({ accountId: 'acc-ana', track: ana.mediaStreamTrack, volume: 0.4 })
    c.setUserMuted('acc-ana', true)
    expect(leveler().voices.get(ana)!.volume).toBe(0)
  })

  it('áudio da tela não passa pelo equalizador', async () => {
    const c = levelerClient()
    c.setLeveler(true)
    await c.join('sala-1')
    const tela = subscribe('acc-ana', Track.Source.ScreenShareAudio)
    expect(leveler()?.voices.size ?? 0).toBe(0)
    expect(tela.attachedElements[0].muted).toBe(false)
  })

  it('ensurdecer zera pelo equalizador e o elemento continua mudo ao voltar', async () => {
    const c = levelerClient()
    c.setLeveler(true)
    await c.join('sala-1')
    const ana = subscribe('acc-ana')
    c.setDeafened(true)
    expect(leveler().voices.get(ana)!.volume).toBe(0)
    c.setDeafened(false)
    expect(leveler().voices.get(ana)!.volume).toBe(1)
    expect(ana.attachedElements[0].muted).toBe(true)
    c.setDeafened(true)
    const bia = subscribe('acc-bia')
    expect(leveler().voices.get(bia)!.volume).toBe(0)
  })

  it('ligar e desligar dentro da sala troca as faixas de caminho', async () => {
    const c = levelerClient()
    await c.join('sala-1')
    const ana = subscribe('acc-ana')
    c.setLeveler(true)
    expect(leveler().voices.has(ana)).toBe(true)
    expect(ana.attachedElements[0].muted).toBe(true)
    c.setLeveler(false)
    expect(leveler().destroyed).toBe(1)
    expect(ana.attachedElements[0].muted).toBe(false)
    expect(ana.setVolume).toHaveBeenLastCalledWith(1)
  })

  it('desligar ensurdecido deixa o elemento mudo', async () => {
    const c = levelerClient()
    c.setLeveler(true)
    await c.join('sala-1')
    const ana = subscribe('acc-ana')
    c.setDeafened(true)
    c.setLeveler(false)
    expect(ana.attachedElements[0].muted).toBe(true)
  })

  it('quem sai deixa o equalizador; sair da sala desmonta tudo', async () => {
    const c = levelerClient()
    c.setLeveler(true)
    await c.join('sala-1')
    const ana = subscribe('acc-ana')
    lastRoom().fire(RoomEvent.TrackUnsubscribed, ana, {}, micOf('acc-ana'))
    expect(leveler().voices.size).toBe(0)
    subscribe('acc-bia')
    c.leave()
    expect(leveler().destroyed).toBe(1)
  })

  it('alvo e saída escolhida chegam ao equalizador, antes e depois de criado', async () => {
    const c = levelerClient()
    c.setLevelerTarget('high')
    await c.setOutputDevice('fone')
    c.setLeveler(true)
    await c.join('sala-1')
    subscribe('acc-ana')
    expect(leveler().target).toBe('high')
    expect(leveler().output).toBe('fone')
    c.setLevelerTarget('low')
    await c.setOutputDevice(null)
    expect(leveler().target).toBe('low')
    expect(leveler().output).toBeNull()
  })

  it('repassa o ganho de cada conta e limpa ao desligar', async () => {
    const c = levelerClient()
    const seen: Record<string, number>[] = []
    c.onLevelerGains = (g) => seen.push(g)
    c.setLeveler(true)
    await c.join('sala-1')
    subscribe('acc-ana')
    leveler().onGainsChange?.({ 'acc-ana': 1.4 })
    expect(seen[seen.length - 1]).toEqual({ 'acc-ana': 1.4 })
    c.setLeveler(false)
    expect(seen[seen.length - 1]).toEqual({})
  })
})

describe('volume do áudio da tela', () => {
  const sharer = (accountId: string) => ({ identity: 'sock-' + accountId, attributes: { accountId } })
  const screenAudio = () => new FakeRemoteTrack(Track.Kind.Audio, Track.Source.ScreenShareAudio)

  it('volume da tela por conta: aplicado ao chegar e na hora, sem mexer na voz da pessoa', async () => {
    client.setScreenVolume('acc-ana', 0.4)
    await client.join('sala-1')
    const voz = new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone)
    const tela = screenAudio()
    lastRoom().fire(RoomEvent.TrackSubscribed, voz, {}, sharer('acc-ana'))
    lastRoom().fire(RoomEvent.TrackSubscribed, tela, {}, sharer('acc-ana'))
    expect(tela.setVolume).toHaveBeenLastCalledWith(0.4)
    expect(voz.setVolume).toHaveBeenLastCalledWith(1)

    client.setScreenVolume('acc-ana', 0.7)
    expect(tela.setVolume).toHaveBeenLastCalledWith(0.7)
    expect(voz.setVolume).toHaveBeenLastCalledWith(1)
  })

  it('silenciar a tela zera só ela e voltar restaura o volume ajustado', async () => {
    await client.join('sala-1')
    const tela = screenAudio()
    lastRoom().fire(RoomEvent.TrackSubscribed, tela, {}, sharer('acc-ana'))
    client.setScreenVolume('acc-ana', 0.5)
    client.setScreenMuted('acc-ana', true)
    expect(tela.setVolume).toHaveBeenLastCalledWith(0)
    client.setScreenVolume('acc-ana', 0.8)
    expect(tela.setVolume).toHaveBeenLastCalledWith(0)
    client.setScreenMuted('acc-ana', false)
    expect(tela.setVolume).toHaveBeenLastCalledWith(0.8)
  })

  it('silenciar a voz da pessoa não silencia a tela dela', async () => {
    await client.join('sala-1')
    const tela = screenAudio()
    lastRoom().fire(RoomEvent.TrackSubscribed, tela, {}, sharer('acc-ana'))
    client.setUserMuted('acc-ana', true)
    client.setOutputVolume(0.5)
    expect(tela.setVolume).toHaveBeenLastCalledWith(0.5)
  })

  it('volume de saída multiplica o volume da tela; valor inválido é corrigido', async () => {
    client.setOutputVolume(0.5)
    await client.join('sala-1')
    const tela = screenAudio()
    lastRoom().fire(RoomEvent.TrackSubscribed, tela, {}, sharer('acc-ana'))
    client.setScreenVolume('acc-ana', 0.6)
    expect(tela.setVolume).toHaveBeenLastCalledWith(0.3)
    client.setScreenVolume('acc-ana', 5)
    expect(tela.setVolume).toHaveBeenLastCalledWith(0.5)
    client.setScreenVolume('acc-ana', Number.NaN)
    expect(tela.setVolume).toHaveBeenLastCalledWith(0.5)
  })

  it('store.screenAudio lista quem tem áudio na tela e sai quando a faixa some', async () => {
    await client.join('sala-1')
    const tela = screenAudio()
    lastRoom().fire(RoomEvent.TrackSubscribed, new FakeRemoteTrack(Track.Kind.Audio, Track.Source.Microphone), {}, sharer('acc-bia'))
    lastRoom().fire(RoomEvent.TrackSubscribed, tela, {}, sharer('acc-ana'))
    expect(useApp.getState().screenAudio).toEqual(['sock-acc-ana'])
    lastRoom().fire(RoomEvent.TrackUnsubscribed, tela, {}, sharer('acc-ana'))
    expect(useApp.getState().screenAudio).toEqual([])
  })

  it('sair da sala limpa store.screenAudio', async () => {
    await client.join('sala-1')
    lastRoom().fire(RoomEvent.TrackSubscribed, screenAudio(), {}, sharer('acc-ana'))
    client.leave()
    expect(useApp.getState().screenAudio).toEqual([])
  })
})
