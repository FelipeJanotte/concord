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
 *
 * Supressão de ruído automática (B13): `lib/noise/processor.ts` entra como processador do microfone
 * (`setProcessor`) antes de publicar; `setNoiseSuppression(false)` manda o áudio cru.
 *
 * Volumes (Configurações de voz): `setMicGain` (0 a 200%) entra no processador do microfone (o de
 * ruído, ou o `MicGainProcessor` com a supressão desligada; em 100% sem supressão, nenhum) e
 * `setOutputVolume` (0 a 100%) multiplica o volume de cada pessoa e vale para todo áudio da sala.
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
  type RemoteTrackPublication,
  type TrackPublication
} from 'livekit-client'
import type { JoinVoiceResult, VoicePermissions } from '@shared/types'
import { permissionsFrom } from './voice-permissions'
import { loadRnnoiseEngine } from './noise/engine'
import { AutoNoiseProcessor, type NoiseMode } from './noise/processor'
import { clampMicGain, clampOutputVolume, MicGainProcessor, type GainControl } from './mic-gain'
import { VoiceLeveler, type LevelerGains } from './leveler/leveler'
import type { LevelerTarget } from './leveler/level'
import { useApp } from '@/store'
import type { AppSocket } from './core'

const AUDIO_CAPTURE = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }

/** Tela em 1080p a 15 fps: texto legível sem pesar demais na rede. */
/**
 * Câmera (B21) em 640x360 a 24 fps, ~350 kbps: rosto nítido sem pesar no upload de quem joga.
 * Sem simulcast (uma camada só): a grade nunca mostra a câmera maior que isso.
 */
const CAMERA_CAPTURE = { resolution: { width: 640, height: 360, frameRate: 24 } }
const CAMERA_PUBLISH = { simulcast: false, videoEncoding: { maxBitrate: 350_000, maxFramerate: 24 } }
const MIC_PUBLISH = { source: Track.Source.Microphone, forceStereo: false }

const SCREEN_CAPTURE = { resolution: { width: 1920, height: 1080, frameRate: 15 }, contentHint: 'detail' as const }

/** O que o VoiceClient usa de fora; os testes trocam por versões falsas. */
export interface VoiceDeps {
  createRoom: (opts: { outputDeviceId: string | null }) => Room
  /** `deviceId` null = microfone padrão do sistema; `noiseSuppression` = supressão nativa do WebRTC */
  createMicTrack: (deviceId: string | null, opts?: { noiseSuppression: boolean }) => Promise<LocalAudioTrack>
  /** processador da supressão automática; avisa o modo atual; `gain` = volume do microfone */
  createNoiseProcessor: (onMode: (mode: NoiseMode) => void, gain: number) => AutoNoiseProcessor
  /** só o volume do microfone (supressão desligada) */
  createGainProcessor: (gain: number) => MicGainProcessor
  /** AudioContext a 48 kHz (o RNNoise só trabalha nessa taxa) */
  createAudioContext: () => AudioContext
  listDevices: (kind: MediaDeviceKind) => Promise<MediaDeviceInfo[]>
  createLeveler: () => VoiceLeveler
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
  createMicTrack: (deviceId, opts) =>
    createLocalAudioTrack({
      ...AUDIO_CAPTURE,
      noiseSuppression: opts?.noiseSuppression ?? true,
      ...(deviceId ? { deviceId } : {})
    }),
  createGainProcessor: (gain) => new MicGainProcessor(gain),
  createNoiseProcessor: (onMode, gain) =>
    new AutoNoiseProcessor(
      {
        loadEngine: loadRnnoiseEngine,
        cores: () => navigator.hardwareConcurrency || 4,
        now: () => Date.now(),
        setInterval: (fn, ms) => window.setInterval(fn, ms),
        clearInterval: (id) => window.clearInterval(id as number)
      },
      onMode,
      gain
    ),
  createAudioContext: () => new AudioContext({ sampleRate: 48000 }),
  // false = não pede permissão só para listar (sem permissão, os nomes vêm vazios).
  listDevices: (kind) => Room.getLocalDevices(kind, false),
  createLeveler: () => new VoiceLeveler()
}

/**
 * Resultado de `join`. `cancelled` = a entrada foi interrompida antes de terminar (a pessoa saiu,
 * trocou de sala ou a conexão com o Concord caiu): não houve erro, mas ela NÃO está na sala.
 */
export interface JoinOutcome extends VoicePermissions {
  micError: unknown
  cancelled: boolean
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
  /** sala cujo `connect` ainda não terminou */
  private connecting: Room | null = null
  /**
   * Sala que estou deixando numa troca: o servidor, ao aceitar a nova, me tira dela no LiveKit
   * (`RemoveParticipant`), então o fim dessa conexão é esperado e não pode virar "queda".
   */
  private switchingFrom: Room | null = null
  /** a sala antiga caiu durante a troca (só importa se a troca for recusada) */
  private switchDropped = false
  private remoteAudio = new Set<RemoteTrack>()
  private muted = false
  /**
   * Pressione para falar (B20): o microfone fica fechado enquanto a tecla não está pressionada.
   * Não é "silenciado" para os outros (o `voice:join`/`voice:update` continuam com `muted`): só
   * deixa de mandar áudio, e o indicador de quem fala some.
   */
  private gateClosed = false
  private deafened = false
  /** ids que o LiveKit diz estarem falando (antes do filtro de mute/deafen) */
  private activeSpeakers: string[] = []
  /** identidade → faixa de vídeo da tela (remota ou a própria, como prévia) */
  private screens = new Map<string, Track>()
  /** câmera ligada de cada conexão da sala (B21), a própria inclusa como prévia */
  private cameras = new Map<string, Track>()
  /** câmera escolhida; null = padrão do sistema */
  private cameraDeviceId: string | null = null
  /** dispositivos escolhidos (null = padrão do sistema) */
  private inputDeviceId: string | null = null
  private outputDeviceId: string | null = null
  /** volume (0 a 1) por conta; quem não está aqui fica em 100% */
  private volumes = new Map<string, number>()
  /** contas silenciadas por mim (o volume delas continua guardado em `volumes`) */
  private mutedUsers = new Set<string>()
  /** faixa do microfone de cada pessoa → conta dela (para aplicar o volume) */
  private voices = new Map<RemoteTrack, string>()

  /** O que esta conexão pode publicar na sala atual (v2): microfone com `speak`, tela com `share`. */
  private permissions: VoicePermissions = { canSpeak: true, canShare: true, canVideo: true }
  /** Chamado quando as permissões mudam com a pessoa na sala (cargo/regra mudou). */
  onPermissionsChange: ((permissions: VoicePermissions) => void) | null = null

  /** Chamado quando a sala cai sem a pessoa ter pedido (removida, servidor de voz fora do ar...). */
  onUnexpectedDisconnect: ((message: string) => void) | null = null
  /** Chamado quando a própria tela para sem ser pelo app (janela fechada, "parar" do sistema...). */
  onScreenShareEnded: (() => void) | null = null
  /** Chamado quando a própria câmera para sem ser pelo botão (perdeu `video`, câmera desconectada). */
  onCameraEnded: (() => void) | null = null
  /** Estado da supressão de ruído: modo atual, 'off' (desligada pela pessoa) ou null (fora de sala). */
  onNoiseModeChange: ((mode: NoiseMode | 'off' | null) => void) | null = null
  private noiseEnabled = true
  private audioContext: AudioContext | null = null
  /** volume do microfone (0 a 2) e o processador que o aplica agora (null = microfone sem processador) */
  private micGain = 1
  private gainControl: GainControl | null = null
  /** volume de saída (0 a 1), multiplica o de cada pessoa */
  private outputVolume = 1
  private levelerEnabled = false
  private levelerTarget: LevelerTarget = 'medium'
  private leveler: VoiceLeveler | null = null
  private leveled = new Set<RemoteTrack>()
  onLevelerGains: ((gains: LevelerGains) => void) | null = null

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
  async join(channelId: string): Promise<JoinOutcome> {
    const socket = this.socket
    if (!socket) throw new Error('Sem conexão com o servidor')

    // A sala atual (se houver) só fecha depois que o servidor aceitar a nova: se a troca for
    // recusada, a pessoa continua onde estava, com áudio, e o servidor também a mantém lá.
    let mic: LocalAudioTrack | null = null
    let micError: unknown = null
    try {
      mic = await this.openMic()
      if (this.micSilenced) await mic.mute()
    } catch (err) {
      micError = err
      console.warn('[voz] sem microfone, entrando só para ouvir:', err)
    }
    const stopMic = (): void => mic?.stop()

    // Troca de sala: daqui até fechar a antiga, o "removido" dela é esperado (ver `switchingFrom`).
    this.switchingFrom = this.room
    this.switchDropped = false
    let res: JoinVoiceResult
    try {
      res = await socket.emitWithAck('voice:join', { channelId, muted: this.muted || !mic, deafened: this.deafened })
    } catch (err) {
      stopMic()
      this.endSwitch(false)
      throw err
    }
    if (!res.ok) {
      stopMic()
      // Troca recusada: o servidor me manteve na antiga. Se ela caiu nesse meio-tempo, aí sim é queda.
      this.endSwitch(false)
      throw new Error(res.error)
    }
    // Sem `speak` o LiveKit recusaria o microfone (403): entra só para ouvir, sem nem capturar.
    const permissions: VoicePermissions = { canSpeak: res.canSpeak !== false, canShare: res.canShare !== false, canVideo: res.canVideo !== false }
    if (!permissions.canSpeak && mic) {
      mic.stop()
      mic = null
    }

    // O servidor já nos tirou da sala anterior: agora sim fecha a conexão antiga.
    this.endSwitch(true)
    this.teardown()
    this.permissions = permissions
    const room = this.deps.createRoom({ outputDeviceId: this.outputDeviceId })
    this.room = room
    this.connecting = room
    this.mic = mic
    this.bindRoom(room)
    try {
      await room.connect(res.url, res.token, { autoSubscribe: true })
      this.connecting = null
      // Saiu, trocou de sala ou a conexão com o Concord caiu enquanto conectava: não é sucesso.
      if (this.room !== room) return { micError, cancelled: true, ...permissions }
      // O filtro entra antes de publicar: ninguém chega a ouvir o áudio cru.
      if (mic) await this.attachProcessor(mic)
      if (mic) await room.localParticipant.publishTrack(mic, MIC_PUBLISH)
      // O Electron libera autoplay, mas no navegador (npm run dev em localhost:5173) isso destrava o áudio.
      void room.startAudio().catch(() => {})
    } catch (err) {
      if (this.connecting === room) this.connecting = null
      // Saiu enquanto conectava: o `teardown` já limpou tudo e não há erro para mostrar.
      if (this.room !== room) return { micError, cancelled: true, ...permissions }
      console.error('[voz] não foi possível conectar ao LiveKit:', err)
      // O servidor do Concord já nos colocou na sala: desfaz para os outros não verem um fantasma.
      this.leave()
      throw new Error('Não foi possível conectar ao servidor de voz. Confira se o LiveKit está rodando (docker compose up -d).')
    }
    return { micError, cancelled: false, ...permissions }
  }

  /**
   * Fim da janela de troca. `accepted`: o servidor aceitou a sala nova (a antiga vai ser fechada).
   * Recusada e a antiga caiu nesse meio-tempo: trata como a queda que foi.
   */
  private endSwitch(accepted: boolean): void {
    const old = this.switchingFrom
    const dropped = this.switchDropped
    this.switchingFrom = null
    this.switchDropped = false
    if (!accepted && dropped && old && this.room === old) {
      this.leave()
      this.onUnexpectedDisconnect?.(describeDisconnect(undefined))
    }
  }

  /** Está numa sala do LiveKit (ou conectando a uma)? */
  get inRoom(): boolean {
    return this.room !== null
  }

  leave(): void {
    if (this.room) this.socket?.emit('voice:leave')
    this.teardown()
  }

  /** Fecha tudo localmente, sem avisar o servidor do Concord. */
  teardown(): void {
    const room = this.room
    this.room = null
    this.switchingFrom = null
    this.switchDropped = false
    if (room) {
      room.removeAllListeners()
      void room.disconnect()
    }
    this.destroyLeveler()
    for (const track of this.remoteAudio) track.detach().forEach((el) => el.remove())
    this.remoteAudio.clear()
    this.voices.clear()
    this.mic?.stop() // o LiveKit destrói o processador junto com a faixa
    this.gainControl = null
    this.onNoiseModeChange?.(null)
    this.mic = null
    this.activeSpeakers = []
    if (Object.keys(useApp.getState().speaking).length) useApp.setState({ speaking: {} })
    this.screens.clear()
    this.publishScreens()
    this.cameras.clear()
    this.publishCameras()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.applyMic()
  }

  /** Pressione para falar (B20): `open` = tecla pressionada (ou modo desligado). */
  setMicGate(open: boolean): void {
    this.gateClosed = !open
    this.applyMic()
  }

  /** O microfone não manda áudio: silenciado pela pessoa ou tecla do push-to-talk solta. */
  private get micSilenced(): boolean {
    return this.muted || this.gateClosed
  }

  private applyMic(): void {
    if (this.mic) void (this.micSilenced ? this.mic.mute() : this.mic.unmute())
    this.publishSpeaking()
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened
    for (const track of this.remoteAudio) this.muteElements(track)
    for (const track of this.leveled) this.applyVolume(track, this.voices.get(track) ?? null)
    this.publishSpeaking()
  }

  // ---------- permissões (v2) ----------

  /** Permissões na sala atual. */
  get currentPermissions(): VoicePermissions {
    return this.permissions
  }

  /**
   * Relê o que o LiveKit deixa publicar agora (`localParticipant.permissions`) e aplica, como o evento
   * `ParticipantPermissionsChanged` faria. Chamado quando o servidor avisa que o silêncio do moderador
   * acabou: se o evento do LiveKit atrasou ou se perdeu, o microfone volta mesmo assim. Sem mudança, nada.
   */
  async syncPermissions(): Promise<void> {
    const room = this.room
    if (!room || this.connecting === room) return
    await this.applyPermissions(room, permissionsFrom(room.localParticipant.permissions))
  }

  /**
   * O cargo/regra mudou com a pessoa na sala: o LiveKit já trocou o que ela pode publicar.
   * Perdeu `speak`: libera o microfone (o LiveKit já parou de repassar). Recuperou: abre e publica
   * de novo. Perdeu `share`: o LiveKit despublica a tela e o `LocalTrackUnpublished` avisa o app.
   */
  private async applyPermissions(room: Room, next: VoicePermissions): Promise<void> {
    const prev = this.permissions
    if (prev.canSpeak === next.canSpeak && prev.canShare === next.canShare && prev.canVideo === next.canVideo) return
    this.permissions = next
    if (prev.canSpeak && !next.canSpeak && this.mic) {
      const mic = this.mic
      this.mic = null
      this.gainControl = null
      await room.localParticipant.unpublishTrack(mic).catch(() => {})
      mic.stop()
    } else if (!prev.canSpeak && next.canSpeak && !this.mic) {
      try {
        const mic = await this.openMic()
        if (this.room !== room) return void mic.stop()
        if (this.micSilenced) await mic.mute()
        this.mic = mic
        await this.attachProcessor(mic)
        await room.localParticipant.publishTrack(mic, MIC_PUBLISH)
      } catch (err) {
        console.warn('[voz] não foi possível ligar o microfone depois de ganhar permissão:', err)
      }
    }
    if (this.room === room) this.onPermissionsChange?.(next)
  }

  // ---------- dispositivos ----------

  listDevices(kind: MediaDeviceKind): Promise<MediaDeviceInfo[]> {
    return this.deps.listDevices(kind)
  }

  /** Troca o microfone (na hora, se estiver numa sala; senão vale para a próxima entrada). */
  async setInputDevice(deviceId: string | null): Promise<void> {
    this.inputDeviceId = deviceId
    if (this.room && this.mic) await this.room.switchActiveDevice('audioinput', deviceId ?? 'default')
  }

  /** Troca a câmera (na hora, se estiver ligada; senão vale para a próxima vez que ligar). */
  async setCameraDevice(deviceId: string | null): Promise<void> {
    this.cameraDeviceId = deviceId
    if (this.room && this.cameras.has(this.room.localParticipant.identity)) {
      await this.room.switchActiveDevice('videoinput', deviceId ?? 'default')
    }
  }

  /** Troca a saída de áudio (alto-falante/fone) de tudo que toca na sala. */
  async setOutputDevice(deviceId: string | null): Promise<void> {
    this.outputDeviceId = deviceId
    this.leveler?.setOutput(deviceId)
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
  // ---------- supressão de ruído (B13) ----------

  /** Liga/desliga a supressão automática (na hora, se estiver numa sala). Desligada = áudio cru. */
  async setNoiseSuppression(enabled: boolean): Promise<void> {
    this.noiseEnabled = enabled
    const mic = this.mic
    if (!mic || !this.room) return
    if (enabled) {
      await this.setNative(mic, true)
      await this.attachNoise(mic)
    } else {
      await mic.stopProcessor()
      this.gainControl = null
      await this.setNative(mic, false)
      this.onNoiseModeChange?.('off')
      if (this.micGain !== 1) await this.attachGain(mic)
    }
  }

  // ---------- volumes ----------

  /** Volume do microfone (0 a 2). Na hora, se estiver numa sala; senão vale para a próxima entrada. */
  async setMicGain(gain: number): Promise<void> {
    this.micGain = clampMicGain(gain)
    if (this.gainControl) return this.gainControl.setGain(this.micGain)
    // supressão desligada e microfone cru: só põe um processador quando o volume sai de 100%
    if (this.mic && this.room && !this.noiseEnabled && this.micGain !== 1) await this.attachGain(this.mic)
  }

  /** Volume de saída (0 a 1): todo áudio da sala, junto com o volume de cada pessoa. */
  setOutputVolume(volume: number): void {
    this.outputVolume = clampOutputVolume(volume)
    for (const track of this.remoteAudio) this.applyVolume(track, this.voices.get(track) ?? null)
  }

  setLeveler(enabled: boolean): void {
    if (enabled === this.levelerEnabled) return
    this.levelerEnabled = enabled
    if (!enabled) return this.destroyLeveler()
    for (const [track, accountId] of this.voices) this.level(track, accountId)
  }

  setLevelerTarget(target: LevelerTarget): void {
    this.levelerTarget = target
    this.leveler?.setTarget(target)
  }

  private level(track: RemoteTrack, accountId: string): void {
    if (!this.leveler) {
      const leveler = this.deps.createLeveler()
      leveler.setTarget(this.levelerTarget)
      leveler.setOutput(this.outputDeviceId)
      leveler.onGainsChange = (gains) => this.onLevelerGains?.(gains)
      this.leveler = leveler
    }
    this.leveled.add(track)
    this.muteElements(track)
    this.leveler.add(track, accountId, track.mediaStreamTrack, this.volumeOf(accountId))
  }

  private destroyLeveler(): void {
    if (!this.leveler) return
    this.leveler.destroy()
    this.leveler = null
    const tracks = [...this.leveled]
    this.leveled.clear()
    for (const track of tracks) {
      this.muteElements(track)
      this.applyVolume(track, this.voices.get(track) ?? null)
    }
    this.onLevelerGains?.({})
  }

  private muteElements(track: RemoteTrack): void {
    const muted = this.deafened || this.leveled.has(track)
    track.attachedElements.forEach((el) => (el.muted = muted))
  }

  /** Processador do microfone antes de publicar: o de ruído (com o volume) ou só o volume. */
  private async attachProcessor(mic: LocalAudioTrack): Promise<void> {
    if (this.noiseEnabled) await this.attachNoise(mic)
    else if (this.micGain !== 1) await this.attachGain(mic)
  }

  private async attachGain(mic: LocalAudioTrack): Promise<void> {
    try {
      this.audioContext ??= this.deps.createAudioContext()
      await mic.setAudioContext(this.audioContext)
      const processor = this.deps.createGainProcessor(this.micGain)
      await mic.setProcessor(processor)
      this.gainControl = processor
    } catch (err) {
      this.gainControl = null
      console.warn('[voz] não foi possível ajustar o volume do microfone:', err)
    }
  }

  /** Põe o processador automático no microfone. Se falhar, fica a supressão nativa. */
  private async attachNoise(mic: LocalAudioTrack): Promise<void> {
    try {
      this.audioContext ??= this.deps.createAudioContext()
      await mic.setAudioContext(this.audioContext)
      const processor = this.deps.createNoiseProcessor((mode) => this.onNoiseModeChange?.(mode), this.micGain)
      await mic.setProcessor(processor)
      this.gainControl = processor
    } catch (err) {
      this.gainControl = null
      console.warn('[ruído] não foi possível ligar o filtro automático:', err)
      this.onNoiseModeChange?.('light-fallback')
    }
  }

  private async setNative(mic: LocalAudioTrack, on: boolean): Promise<void> {
    try {
      await mic.mediaStreamTrack.applyConstraints({ noiseSuppression: on })
    } catch {
      // nem todo dispositivo deixa trocar com a faixa aberta
    }
  }

  private async openMic(): Promise<LocalAudioTrack> {
    const opts = { noiseSuppression: this.noiseEnabled }
    if (!this.inputDeviceId) return this.deps.createMicTrack(null, opts)
    try {
      return await this.deps.createMicTrack(this.inputDeviceId, opts)
    } catch (err) {
      console.warn('[voz] microfone escolhido indisponível, usando o padrão:', err)
      return this.deps.createMicTrack(null, opts)
    }
  }

  /** Volume de uma faixa: o de saída × o da pessoa (`accountId` null = áudio da tela, só o de saída). */
  private applyVolume(track: RemoteTrack, accountId: string | null): void {
    if (this.leveled.has(track) && accountId !== null) return this.leveler?.setVolume(track, this.volumeOf(accountId))
    const personal = accountId === null ? 1 : this.mutedUsers.has(accountId) ? 0 : (this.volumes.get(accountId) ?? 1)
    const volume = personal * this.outputVolume
    ;(track as RemoteTrack & { setVolume?: (v: number) => void }).setVolume?.(volume)
  }

  private volumeOf(accountId: string): number {
    if (this.deafened || this.mutedUsers.has(accountId)) return 0
    return (this.volumes.get(accountId) ?? 1) * this.outputVolume
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

  screenMediaTrack(userId: string): MediaStreamTrack | undefined {
    return this.screens.get(userId)?.mediaStreamTrack
  }

  // ---------- câmera (B21) ----------

  /** Liga ou desliga a própria câmera na sala atual (qualidade limitada: `CAMERA_CAPTURE`). */
  async setCamera(on: boolean): Promise<void> {
    const room = this.room
    if (!room) {
      if (on) throw new Error('Entre numa sala de voz para ligar a câmera')
      return
    }
    if (on && !this.permissions.canVideo) throw new Error('Você não tem permissão para ligar a câmera nesta sala')
    const capture = { ...CAMERA_CAPTURE, ...(this.cameraDeviceId ? { deviceId: this.cameraDeviceId } : {}) }
    await room.localParticipant.setCameraEnabled(on, on ? capture : undefined, on ? CAMERA_PUBLISH : undefined)
  }

  /** Liga a câmera de `userId` num <video>. Devolve a função que desliga. */
  attachCamera(userId: string, el: HTMLVideoElement): () => void {
    const track = this.cameras.get(userId)
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
          // câmera desligada (silenciada) de quem já estava na sala: só aparece quando religar (TrackUnmuted)
          else if (track.source === Track.Source.Camera && !track.isMuted) this.addCamera(participant.identity, track)
          return
        }
        // Áudio: microfone e áudio da tela de cada um.
        const el = track.attach()
        el.muted = this.deafened
        this.remoteAudio.add(track)
        const accountId = participant?.attributes?.accountId
        if (track.source === Track.Source.Microphone && accountId) {
          this.voices.set(track, accountId)
          if (this.levelerEnabled) this.level(track, accountId)
          else this.applyVolume(track, accountId)
        } else if (this.outputVolume !== 1) this.applyVolume(track, null)
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: Participant) => {
        if (track.kind === Track.Kind.Video) {
          if (track.source === Track.Source.Camera) return this.removeCamera(participant.identity, track)
          return this.removeScreen(participant.identity, track)
        }
        this.voices.delete(track)
        if (this.leveled.delete(track)) this.leveler?.remove(track)
        if (!this.remoteAudio.delete(track)) return
        track.detach().forEach((el) => el.remove())
      })
      .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication, participant: Participant) => {
        if (pub.source === Track.Source.ScreenShare && pub.track) this.addScreen(participant.identity, pub.track)
        if (pub.source === Track.Source.Camera && pub.track) this.addCamera(participant.identity, pub.track)
      })
      // `setCameraEnabled(false)` não despublica: silencia a faixa (a publicação fica). Câmera silenciada = sem câmera
      // na grade; religar só tira o silêncio (não há `LocalTrackPublished`/`TrackSubscribed` de novo).
      .on(RoomEvent.TrackMuted, (pub: TrackPublication, participant: Participant) => {
        if (pub.source === Track.Source.Camera && pub.track) this.removeCamera(participant.identity, pub.track)
      })
      .on(RoomEvent.TrackUnmuted, (pub: TrackPublication, participant: Participant) => {
        if (pub.source === Track.Source.Camera && pub.track) this.addCamera(participant.identity, pub.track)
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub: LocalTrackPublication, participant: Participant) => {
        if (pub.source === Track.Source.Camera) {
          if (pub.track) this.removeCamera(participant.identity, pub.track)
          else if (this.cameras.delete(participant.identity)) this.publishCameras()
          return this.onCameraEnded?.()
        }
        if (pub.source !== Track.Source.ScreenShare) return
        if (pub.track) this.removeScreen(participant.identity, pub.track)
        else if (this.screens.delete(participant.identity)) this.publishScreens()
        this.onScreenShareEnded?.()
      })
      .on(RoomEvent.ParticipantPermissionsChanged, (_prev: unknown, participant: Participant) => {
        if (this.room !== room || participant !== room.localParticipant) return
        void this.applyPermissions(room, permissionsFrom(room.localParticipant.permissions))
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
        // Ainda conectando: quem trata a falha é o `join` (com a mensagem certa), não o aviso de queda.
        if (this.connecting === room) return
        // Trocando de sala: o servidor me tira da antiga ao aceitar a nova. Esperado; o `join` decide.
        if (this.switchingFrom === room) {
          this.switchDropped = true
          return
        }
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

  private addCamera(identity: string, track: Track): void {
    this.cameras.set(identity, track)
    this.publishCameras()
  }

  private removeCamera(identity: string, track: Track): void {
    if (this.cameras.get(identity) !== track) return
    this.cameras.delete(identity)
    this.publishCameras()
  }

  /** `store.cameras` = quem está com a câmera ligada agora (só muda a store se mudou). */
  private publishCameras(): void {
    const next = [...this.cameras.keys()]
    const prev = useApp.getState().cameras
    if (prev.length !== next.length || next.some((id, i) => prev[i] !== id)) useApp.setState({ cameras: next })
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
      const silenced = id === selfId ? this.micSilenced : this.deafened
      if (!silenced) next[id] = true
    }
    const prev = useApp.getState().speaking
    const prevKeys = Object.keys(prev)
    const nextKeys = Object.keys(next)
    if (prevKeys.length !== nextKeys.length || nextKeys.some((k) => !prev[k])) useApp.setState({ speaking: next })
  }
}

export const voice = new VoiceClient()
