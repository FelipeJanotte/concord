/**
 * Voz via LiveKit (SFU). O servidor do Concord valida a entrada e devolve
 * `{ url, token }` no ack do `voice:join`; daqui em diante o áudio vai e volta
 * pelo LiveKit (uma conexão por pessoa, não uma por par como na malha antiga).
 *
 * A API pública (`join`, `leave`, `setMuted`, `setDeafened`, `teardown`) é a mesma
 * da versão P2P, então `lib/actions/voice.ts` e a interface não mudaram.
 * Identidade na sala = `socket.id` = `VoiceState.userId` = chave de `speaking` e de `screens`.
 *
 * Tela (B3): `startScreenShare` publica a tela pelo LiveKit (no Electron, a fonte foi
 * escolhida antes no ScreenPicker; ver src/main/screen-share.ts). As telas dos outros
 * (e a própria, como prévia) ficam em `store.screens`; a UI liga cada uma num <video>
 * com `attachScreen`.
 *
 * Dispositivos (B4): microfone e saída escolhidos (`setInputDevice`/`setOutputDevice`), volume por pessoa
 * (`setUserVolume`) e silenciar alguém só para mim (`setUserMuted`, que guarda o volume para quando voltar).
 * Tudo por conta, porque a identidade muda a cada conexão.
 */
import {
  createLocalAudioTrack,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type LocalTrackPublication,
  type Participant,
  type RemoteTrack,
  type RemoteTrackPublication
} from 'livekit-client'
import type { JoinVoiceResult } from '@shared/types'
import { useApp } from '@/store'
import type { AppSocket } from './core'

const AUDIO_CAPTURE = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }

/** Tela em 1080p a 15 fps: texto legível sem pesar demais na rede. */
const SCREEN_CAPTURE = { resolution: { width: 1920, height: 1080, frameRate: 15 }, contentHint: 'detail' as const }

/** O que o VoiceClient usa de fora; os testes trocam por versões falsas. */
export interface VoiceDeps {
  createRoom: (opts: { outputDeviceId: string | null }) => Room
  /** `deviceId` null = microfone padrão do sistema */
  createMicTrack: (deviceId: string | null) => Promise<LocalAudioTrack>
  listDevices: (kind: 'audioinput' | 'audiooutput') => Promise<MediaDeviceInfo[]>
}

const defaultDeps: VoiceDeps = {
  createRoom: ({ outputDeviceId }) =>
    new Room({
      audioCaptureDefaults: AUDIO_CAPTURE,
      // Saída escolhida (B4): vale para todo áudio que chegar nesta sala.
      audioOutput: outputDeviceId ? { deviceId: outputDeviceId } : undefined,
      // DTX economiza banda no silêncio; RED deixa o áudio mais resistente a perda de pacotes.
      publishDefaults: { dtx: true, red: true },
      // Para a tela (B3): só recebe a resolução que está sendo exibida.
      adaptiveStream: true,
      dynacast: true
    }),
  createMicTrack: (deviceId) => createLocalAudioTrack(deviceId ? { ...AUDIO_CAPTURE, deviceId } : AUDIO_CAPTURE),
  // false = não pede permissão só para listar (sem permissão, os nomes vêm vazios).
  listDevices: (kind) => Room.getLocalDevices(kind, false)
}

/** Traduz o motivo de desconexão do LiveKit para uma frase da interface. */
function describeDisconnect(reason: DisconnectReason | undefined): string {
  switch (reason) {
    case DisconnectReason.PARTICIPANT_REMOVED:
      return 'Você foi removido da sala de voz.'
    case DisconnectReason.ROOM_DELETED:
      return 'A sala de voz foi encerrada.'
    case DisconnectReason.DUPLICATE_IDENTITY:
      return 'Você entrou nesta sala em outra conexão.'
    default:
      return 'A conexão com o servidor de voz caiu.'
  }
}

export class VoiceClient {
  private socket: AppSocket | null = null
  private room: Room | null = null
  private mic: LocalAudioTrack | null = null
  private remoteAudio = new Set<RemoteTrack>()
  private muted = false
  private deafened = false
  /** ids que o LiveKit diz estarem falando (antes do filtro de mute/deafen) */
  private activeSpeakers: string[] = []
  /** identidade → faixa de vídeo da tela (remota ou a própria, como prévia) */
  private screens = new Map<string, Track>()
  /** dispositivos escolhidos (null = padrão do sistema) */
  private inputDeviceId: string | null = null
  private outputDeviceId: string | null = null
  /** volume (0 a 1) por conta; quem não está aqui fica em 100% */
  private volumes = new Map<string, number>()
  /** contas silenciadas por mim (o volume delas continua guardado em `volumes`) */
  private mutedUsers = new Set<string>()
  /** faixa do microfone de cada pessoa → conta dela (para aplicar o volume) */
  private voices = new Map<RemoteTrack, string>()

  /** Chamado quando a sala cai sem a pessoa ter pedido (removida, servidor de voz fora do ar...). */
  onUnexpectedDisconnect: ((message: string) => void) | null = null
  /** Chamado quando a própria tela para sem ser pelo app (janela fechada, "parar" do sistema...). */
  onScreenShareEnded: (() => void) | null = null

  private readonly deps: VoiceDeps

  /** Cada dependência pode ser trocada (testes); o que faltar usa a de verdade. */
  constructor(deps: Partial<VoiceDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps }
  }

  setSocket(socket: AppSocket | null): void {
    this.socket = socket
  }

  /**
   * Entra na sala. Se o microfone não estiver disponível (sem dispositivo,
   * permissão negada, em uso por outro programa), entra mesmo assim só para
   * ouvir e devolve o erro em `micError` para a UI avisar o usuário.
   */
  async join(channelId: string): Promise<{ micError: unknown }> {
    const socket = this.socket
    if (!socket) throw new Error('Sem conexão com o servidor')

    this.teardown()

    let mic: LocalAudioTrack | null = null
    let micError: unknown = null
    try {
      mic = await this.openMic()
      if (this.muted) await mic.mute()
    } catch (err) {
      micError = err
      console.warn('[voz] sem microfone, entrando só para ouvir:', err)
    }
    const stopMic = (): void => mic?.stop()

    let res: JoinVoiceResult
    try {
      res = await socket.emitWithAck('voice:join', { channelId, muted: this.muted || !mic, deafened: this.deafened })
    } catch (err) {
      stopMic()
      throw err
    }
    if (!res.ok) {
      stopMic()
      throw new Error(res.error)
    }

    const room = this.deps.createRoom({ outputDeviceId: this.outputDeviceId })
    this.room = room
    this.mic = mic
    this.bindRoom(room)
    try {
      await room.connect(res.url, res.token, { autoSubscribe: true })
      if (this.room !== room) return { micError } // saiu (ou trocou de sala) enquanto conectava
      if (mic) await room.localParticipant.publishTrack(mic, { source: Track.Source.Microphone })
      // O Electron libera autoplay, mas no navegador (npm run dev em localhost:5173) isso destrava o áudio.
      void room.startAudio().catch(() => {})
    } catch (err) {
      // Saiu enquanto conectava: o `teardown` já limpou tudo e não há erro para mostrar.
      if (this.room !== room) return { micError }
      console.error('[voz] não foi possível conectar ao LiveKit:', err)
      // O servidor do Concord já nos colocou na sala: desfaz para os outros não verem um fantasma.
      this.leave()
      throw new Error('Não foi possível conectar ao servidor de voz. Confira se o LiveKit está rodando (docker compose up -d).')
    }
    return { micError }
  }

  leave(): void {
    if (this.room) this.socket?.emit('voice:leave')
    this.teardown()
  }

  /** Fecha tudo localmente, sem avisar o servidor do Concord. */
  teardown(): void {
    const room = this.room
    this.room = null
    if (room) {
      room.removeAllListeners()
      void room.disconnect()
    }
    for (const track of this.remoteAudio) track.detach().forEach((el) => el.remove())
    this.remoteAudio.clear()
    this.voices.clear()
    this.mic?.stop()
    this.mic = null
    this.activeSpeakers = []
    if (Object.keys(useApp.getState().speaking).length) useApp.setState({ speaking: {} })
    this.screens.clear()
    this.publishScreens()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.mic) void (muted ? this.mic.mute() : this.mic.unmute())
    this.publishSpeaking()
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened
    for (const track of this.remoteAudio) track.attachedElements.forEach((el) => (el.muted = deafened))
    this.publishSpeaking()
  }

  // ---------- dispositivos ----------

  listDevices(kind: 'audioinput' | 'audiooutput'): Promise<MediaDeviceInfo[]> {
    return this.deps.listDevices(kind)
  }

  /** Troca o microfone (na hora, se estiver numa sala; senão vale para a próxima entrada). */
  async setInputDevice(deviceId: string | null): Promise<void> {
    this.inputDeviceId = deviceId
    if (this.room && this.mic) await this.room.switchActiveDevice('audioinput', deviceId ?? 'default')
  }

  /** Troca a saída de áudio (alto-falante/fone) de tudo que toca na sala. */
  async setOutputDevice(deviceId: string | null): Promise<void> {
    this.outputDeviceId = deviceId
    if (this.room) await this.room.switchActiveDevice('audiooutput', deviceId ?? 'default')
  }

  /** Volume da voz de uma pessoa (0 a 1), por conta. */
  setUserVolume(accountId: string, volume: number): void {
    const v = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1))
    if (v === 1) this.volumes.delete(accountId)
    else this.volumes.set(accountId, v)
    for (const [track, owner] of this.voices) if (owner === accountId) this.applyVolume(track, owner)
  }

  /** Silencia (ou volta) a voz de uma pessoa só para mim, sem perder o volume ajustado. */
  setUserMuted(accountId: string, muted: boolean): void {
    if (muted) this.mutedUsers.add(accountId)
    else this.mutedUsers.delete(accountId)
    for (const [track, owner] of this.voices) if (owner === accountId) this.applyVolume(track, owner)
  }

  /** Abre o microfone escolhido; se ele sumiu (desconectado), cai para o padrão do sistema. */
  private async openMic(): Promise<LocalAudioTrack> {
    if (!this.inputDeviceId) return this.deps.createMicTrack(null)
    try {
      return await this.deps.createMicTrack(this.inputDeviceId)
    } catch (err) {
      console.warn('[voz] microfone escolhido indisponível, usando o padrão:', err)
      return this.deps.createMicTrack(null)
    }
  }

  private applyVolume(track: RemoteTrack, accountId: string): void {
    const volume = this.mutedUsers.has(accountId) ? 0 : (this.volumes.get(accountId) ?? 1)
    ;(track as RemoteTrack & { setVolume?: (v: number) => void }).setVolume?.(volume)
  }

  // ---------- tela ----------

  /** Publica a tela. A fonte (no Electron) já foi escolhida pelo ScreenPicker. */
  async startScreenShare(audio: boolean): Promise<void> {
    const room = this.room
    if (!room) throw new Error('Entre numa sala de voz para compartilhar a tela')
    await room.localParticipant.setScreenShareEnabled(true, { ...SCREEN_CAPTURE, audio, systemAudio: audio ? 'include' : 'exclude' })
  }

  async stopScreenShare(): Promise<void> {
    await this.room?.localParticipant.setScreenShareEnabled(false)
  }

  /** Liga a tela de `userId` num <video>. Devolve a função que desliga. */
  attachScreen(userId: string, el: HTMLVideoElement): () => void {
    const track = this.screens.get(userId)
    if (!track) return () => {}
    track.attach(el)
    return () => void track.detach(el)
  }

  // ---------- internos ----------

  private bindRoom(room: Room): void {
    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: Participant) => {
        if (track.kind === Track.Kind.Video) {
          if (track.source === Track.Source.ScreenShare) this.addScreen(participant.identity, track)
          return
        }
        // Áudio: microfone e áudio da tela de cada um.
        const el = track.attach()
        el.muted = this.deafened
        this.remoteAudio.add(track)
        const accountId = participant?.attributes?.accountId
        if (track.source === Track.Source.Microphone && accountId) {
          this.voices.set(track, accountId)
          this.applyVolume(track, accountId)
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: Participant) => {
        if (track.kind === Track.Kind.Video) return this.removeScreen(participant.identity, track)
        this.voices.delete(track)
        if (!this.remoteAudio.delete(track)) return
        track.detach().forEach((el) => el.remove())
      })
      .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication, participant: Participant) => {
        if (pub.source === Track.Source.ScreenShare && pub.track) this.addScreen(participant.identity, pub.track)
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication, participant: Participant) => {
        if (pub.source !== Track.Source.ScreenShare) return
        if (pub.track) this.removeScreen(participant.identity, pub.track)
        else if (this.screens.delete(participant.identity)) this.publishScreens()
        this.onScreenShareEnded?.()
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        this.activeSpeakers = speakers.map((p) => p.identity)
        this.publishSpeaking()
      })
      .on(RoomEvent.Reconnecting, () => console.warn('[voz] conexão instável, reconectando...'))
      .on(RoomEvent.Reconnected, () => console.info('[voz] reconectado'))
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        // `teardown` remove os listeners antes de desconectar, então aqui só chega queda não pedida.
        if (this.room !== room) return
        console.warn('[voz] desconectado do LiveKit:', reason)
        this.leave()
        this.onUnexpectedDisconnect?.(describeDisconnect(reason))
      })
  }

  private addScreen(identity: string, track: Track): void {
    this.screens.set(identity, track)
    this.publishScreens()
  }

  private removeScreen(identity: string, track: Track): void {
    if (this.screens.get(identity) !== track) return
    this.screens.delete(identity)
    this.publishScreens()
  }

  /** `store.screens` = quem tem tela disponível agora (só muda a store se mudou). */
  private publishScreens(): void {
    const next = [...this.screens.keys()]
    const prev = useApp.getState().screens
    if (prev.length !== next.length || next.some((id, i) => prev[i] !== id)) useApp.setState({ screens: next })
  }

  /** Atualiza `store.speaking` (só quando muda, para não re-renderizar à toa). */
  private publishSpeaking(): void {
    const selfId = useApp.getState().self?.id
    const next: Record<string, boolean> = {}
    for (const id of this.activeSpeakers) {
      const silenced = id === selfId ? this.muted : this.deafened
      if (!silenced) next[id] = true
    }
    const prev = useApp.getState().speaking
    const prevKeys = Object.keys(prev)
    const nextKeys = Object.keys(next)
    if (prevKeys.length !== nextKeys.length || nextKeys.some((k) => !prev[k])) useApp.setState({ speaking: next })
  }
}

export const voice = new VoiceClient()
