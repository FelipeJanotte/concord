/**
 * Voz via LiveKit (SFU). O servidor do Concord valida a entrada e devolve
 * `{ url, token }` no ack do `voice:join`; daqui em diante o áudio vai e volta
 * pelo LiveKit (uma conexão por pessoa, não uma por par como na malha antiga).
 *
 * A API pública (`join`, `leave`, `setMuted`, `setDeafened`, `teardown`) é a mesma
 * da versão P2P, então `lib/actions/voice.ts` e a interface não mudaram.
 * Identidade na sala = `socket.id` = `VoiceState.userId` = chave de `speaking`.
 */
import {
  createLocalAudioTrack,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type Participant,
  type RemoteTrack
} from 'livekit-client'
import type { JoinVoiceResult } from '@shared/types'
import { useApp } from '@/store'
import type { AppSocket } from './core'

const AUDIO_CAPTURE = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }

/** O que o VoiceClient usa de fora; os testes trocam por versões falsas. */
export interface VoiceDeps {
  createRoom: () => Room
  createMicTrack: () => Promise<LocalAudioTrack>
}

const defaultDeps: VoiceDeps = {
  createRoom: () =>
    new Room({
      audioCaptureDefaults: AUDIO_CAPTURE,
      // DTX economiza banda no silêncio; RED deixa o áudio mais resistente a perda de pacotes.
      publishDefaults: { dtx: true, red: true },
      // Para a tela (B3): só recebe a resolução que está sendo exibida.
      adaptiveStream: true,
      dynacast: true
    }),
  createMicTrack: () => createLocalAudioTrack(AUDIO_CAPTURE)
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

  /** Chamado quando a sala cai sem a pessoa ter pedido (removida, servidor de voz fora do ar...). */
  onUnexpectedDisconnect: ((message: string) => void) | null = null

  constructor(private readonly deps: VoiceDeps = defaultDeps) {}

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
      mic = await this.deps.createMicTrack()
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

    const room = this.deps.createRoom()
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
    this.mic?.stop()
    this.mic = null
    this.activeSpeakers = []
    if (Object.keys(useApp.getState().speaking).length) useApp.setState({ speaking: {} })
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

  // ---------- internos ----------

  private bindRoom(room: Room): void {
    room
      .on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return // vídeo/tela: B3
        const el = track.attach()
        el.muted = this.deafened
        this.remoteAudio.add(track)
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        if (!this.remoteAudio.delete(track)) return
        track.detach().forEach((el) => el.remove())
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
