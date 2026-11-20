import {
  createLocalAudioTrack,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type AudioCaptureOptions,
  type LocalAudioTrack,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type TrackPublication
} from 'livekit-client'
import type { JoinVoiceResult, VoicePermissions } from '@shared/types'
import { permissionsFrom } from './voice-permissions'
import { loadRnnoiseEngine } from './noise/engine'
import { AutoNoiseProcessor, type NoiseMode } from './noise/processor'
import { clampMicGain, clampOutputVolume, MicGainProcessor, type GainControl } from './mic-gain'
import { AudioClockWatchdog } from './audio-clock'
import { SpeakingDetector } from './speaking/detector'
import { VoiceLeveler, type LevelerGains } from './leveler/leveler'
import type { LevelerTarget } from './leveler/level'
import type { ScreenAudioChoice } from '@shared/screen'
import { useApp } from '@/store'
import { NO_OWN_SCREEN_SHARE, type OwnScreenShare } from '@/store/voice'
import type { AppSocket } from './core'

const AUDIO_CAPTURE = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }

function micCapture(deviceId: string | null, noiseSuppression: boolean): AudioCaptureOptions {
  return { ...AUDIO_CAPTURE, noiseSuppression, ...(deviceId ? { deviceId } : {}) }
}

const CAMERA_CAPTURE = { resolution: { width: 640, height: 360, frameRate: 24 } }
const CAMERA_PUBLISH = { simulcast: false, videoEncoding: { maxBitrate: 350_000, maxFramerate: 24 } }
const MIC_PUBLISH = { source: Track.Source.Microphone, forceStereo: false }

export const MUSIC_BOT_VOLUME_ID = 'music-bot'

const volumeIdOf = (participant: ScreenOwner | undefined): string | undefined =>
  participant?.attributes?.accountId ?? (participant?.attributes?.bot === 'music' ? MUSIC_BOT_VOLUME_ID : undefined)

const SCREEN_IDENTITY_SUFFIX = ':screen'

function screenOfMetadata(identity: string, metadata: string | undefined): string | null {
  if (!metadata) return null
  try {
    const parsed: unknown = JSON.parse(metadata)
    const screenOf = typeof parsed === 'object' && parsed !== null ? (parsed as { screenOf?: unknown }).screenOf : undefined
    return typeof screenOf === 'string' && screenOf ? screenOf : null
  } catch (error) {
    console.warn('[tela] metadata inválido no participante', identity, error)
    return null
  }
}

export function screenOwnerOf(identity: string, metadata?: string): string | null {
  if (!identity.endsWith(SCREEN_IDENTITY_SUFFIX)) return null
  return screenOfMetadata(identity, metadata) ?? (identity.slice(0, -SCREEN_IDENTITY_SUFFIX.length) || null)
}

type ScreenOwner = Pick<Participant, 'identity' | 'attributes'>

const isScreenTrack = (source: Track.Source): boolean => source === Track.Source.ScreenShare || source === Track.Source.ScreenShareAudio

const SCREEN_CAPTURE = { resolution: { width: 1920, height: 1080, frameRate: 15 }, contentHint: 'detail' as const }

export interface VoiceDeps {
  createRoom: (opts: { outputDeviceId: string | null }) => Room
  createMicTrack: (deviceId: string | null, opts?: { noiseSuppression: boolean }) => Promise<LocalAudioTrack>
  createNoiseProcessor: (onMode: (mode: NoiseMode) => void, gain: number) => AutoNoiseProcessor
  createGainProcessor: (gain: number) => MicGainProcessor
  createAudioContext: () => AudioContext
  createClockWatchdog: (ctx: AudioContext) => { stop: () => void }
  listDevices: (kind: MediaDeviceKind) => Promise<MediaDeviceInfo[]>
  createLeveler: () => VoiceLeveler
}

const defaultDeps: VoiceDeps = {
  createRoom: ({ outputDeviceId }) =>
    new Room({
      audioCaptureDefaults: AUDIO_CAPTURE,
      audioOutput: outputDeviceId ? { deviceId: outputDeviceId } : undefined,
      publishDefaults: { dtx: true, red: true },
      adaptiveStream: true,
      dynacast: true
    }),
  createMicTrack: (deviceId, opts) => createLocalAudioTrack(micCapture(deviceId, opts?.noiseSuppression ?? true)),
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
  createClockWatchdog: (ctx) => {
    const watchdog = new AudioClockWatchdog(ctx, {
      now: () => performance.now(),
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (id) => window.clearInterval(id as number),
      onRecover: (rate) => console.warn(`[voz] áudio do microfone rodava a ${rate}x da velocidade; processamento reiniciado`)
    })
    watchdog.start()
    return watchdog
  },
  listDevices: (kind) => Room.getLocalDevices(kind, false),
  createLeveler: () => new VoiceLeveler()
}

export interface JoinOutcome extends VoicePermissions {
  micError: unknown
  cancelled: boolean
}

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
  private connecting: Room | null = null
  private switchingFrom: Room | null = null
  private switchDropped = false
  private remoteAudio = new Set<RemoteTrack>()
  private muted = false
  private gateClosed = false
  private deafened = false
  private measuredSpeakers: string[] = []
  private speakingDetector: SpeakingDetector | null = null
  private screens = new Map<string, Track>()
  private cameras = new Map<string, Track>()
  private cameraDeviceId: string | null = null
  private inputDeviceId: string | null = null
  private outputDeviceId: string | null = null
  private volumes = new Map<string, number>()
  private mutedUsers = new Set<string>()
  private voices = new Map<RemoteTrack, string>()
  private screenVolumes = new Map<string, number>()
  private mutedScreens = new Set<string>()
  private screenAudio = new Map<RemoteTrack, { identity: string; accountId: string | undefined }>()

  private permissions: VoicePermissions = { canSpeak: true, canShare: true, canVideo: true }
  onPermissionsChange: ((permissions: VoicePermissions) => void) | null = null

  onUnexpectedDisconnect: ((message: string) => void) | null = null
  onScreenShareEnded: (() => void) | null = null
  onCameraEnded: (() => void) | null = null
  onNoiseModeChange: ((mode: NoiseMode | 'off' | null) => void) | null = null
  private noiseEnabled = true
  private audioContext: AudioContext | null = null
  private clockWatchdog: { stop: () => void } | null = null
  private micGain = 1
  private gainControl: GainControl | null = null
  private outputVolume = 1
  private levelerEnabled = false
  private levelerTarget: LevelerTarget = 'medium'
  private leveler: VoiceLeveler | null = null
  private leveled = new Set<RemoteTrack>()
  onLevelerGains: ((gains: LevelerGains) => void) | null = null

  private readonly deps: VoiceDeps

  constructor(deps: Partial<VoiceDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps }
  }

  setSocket(socket: AppSocket | null): void {
    this.socket = socket
  }

  async join(channelId: string): Promise<JoinOutcome> {
    const socket = this.socket
    if (!socket) throw new Error('Sem conexão com o servidor')

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
      this.endSwitch(false)
      throw new Error(res.error)
    }
    const permissions: VoicePermissions = { canSpeak: res.canSpeak !== false, canShare: res.canShare !== false, canVideo: res.canVideo !== false }
    if (!permissions.canSpeak && mic) {
      mic.stop()
      mic = null
    }

    this.endSwitch(true)
    this.teardown()
    this.permissions = permissions
    const room = this.deps.createRoom({ outputDeviceId: this.outputDeviceId })
    this.room = room
    this.connecting = room
    this.mic = mic
    this.bindRoom(room)
    try {
      await room.connect(res.url, res.token, { autoSubscribe: false })
      this.connecting = null
      if (this.room !== room) return { micError, cancelled: true, ...permissions }
      this.subscribeToPresent(room)
      this.detector().watch(room.localParticipant.identity, () => this.mic?.mediaStreamTrack)
      if (mic) await this.attachProcessor(mic)
      if (mic) await room.localParticipant.publishTrack(mic, MIC_PUBLISH)
      void room.startAudio().catch(() => {})
    } catch (err) {
      if (this.connecting === room) this.connecting = null
      if (this.room !== room) return { micError, cancelled: true, ...permissions }
      console.error('[voz] não foi possível conectar ao LiveKit:', err)
      this.leave()
      throw new Error('Não foi possível conectar ao servidor de voz. Confira se o LiveKit está rodando (docker compose up -d).')
    }
    return { micError, cancelled: false, ...permissions }
  }

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

  get inRoom(): boolean {
    return this.room !== null
  }

  leave(): void {
    if (this.room) this.socket?.emit('voice:leave')
    this.teardown()
  }

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
    this.speakingDetector?.destroy()
    this.speakingDetector = null
    for (const track of this.remoteAudio) track.detach().forEach((el) => el.remove())
    this.remoteAudio.clear()
    this.voices.clear()
    this.screenAudio.clear()
    this.publishScreenAudio()
    this.mic?.stop()
    this.closeAudioContext()
    this.gainControl = null
    this.onNoiseModeChange?.(null)
    this.mic = null
    this.measuredSpeakers = []
    if (Object.keys(useApp.getState().speaking).length) useApp.setState({ speaking: {} })
    this.screens.clear()
    if (useApp.getState().ownScreenShare.kind !== 'none') useApp.setState({ ownScreenShare: NO_OWN_SCREEN_SHARE })
    this.publishScreens()
    this.cameras.clear()
    this.publishCameras()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.applyMic()
  }

  setMicGate(open: boolean): void {
    this.gateClosed = !open
    this.applyMic()
  }

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
    for (const track of this.leveled) this.applyVolume(track)
    this.publishSpeaking()
  }

  get currentPermissions(): VoicePermissions {
    return this.permissions
  }

  async syncPermissions(): Promise<void> {
    const room = this.room
    if (!room || this.connecting === room) return
    await this.applyPermissions(room, permissionsFrom(room.localParticipant.permissions))
  }

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

  listDevices(kind: MediaDeviceKind): Promise<MediaDeviceInfo[]> {
    return this.deps.listDevices(kind)
  }

  async setInputDevice(deviceId: string | null): Promise<void> {
    this.inputDeviceId = deviceId
    if (this.room && this.mic) await this.room.switchActiveDevice('audioinput', deviceId ?? 'default')
  }

  async setCameraDevice(deviceId: string | null): Promise<void> {
    this.cameraDeviceId = deviceId
    if (this.room && this.cameras.has(this.room.localParticipant.identity)) {
      await this.room.switchActiveDevice('videoinput', deviceId ?? 'default')
    }
  }

  async setOutputDevice(deviceId: string | null): Promise<void> {
    this.outputDeviceId = deviceId
    this.leveler?.setOutput(deviceId)
    if (this.room) await this.room.switchActiveDevice('audiooutput', deviceId ?? 'default')
  }

  setUserVolume(accountId: string, volume: number): void {
    const v = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1))
    if (v === 1) this.volumes.delete(accountId)
    else this.volumes.set(accountId, v)
    for (const [track, owner] of this.voices) if (owner === accountId) this.applyVolume(track)
  }

  setUserMuted(accountId: string, muted: boolean): void {
    if (muted) this.mutedUsers.add(accountId)
    else this.mutedUsers.delete(accountId)
    for (const [track, owner] of this.voices) if (owner === accountId) this.applyVolume(track)
  }

  setScreenVolume(accountId: string, volume: number): void {
    const v = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1))
    if (v === 1) this.screenVolumes.delete(accountId)
    else this.screenVolumes.set(accountId, v)
    this.applyScreenVolumes(accountId)
  }

  setScreenMuted(accountId: string, muted: boolean): void {
    if (muted) this.mutedScreens.add(accountId)
    else this.mutedScreens.delete(accountId)
    this.applyScreenVolumes(accountId)
  }

  private applyScreenVolumes(accountId: string): void {
    for (const [track, owner] of this.screenAudio) if (owner.accountId === accountId) this.applyVolume(track)
  }

  async setNoiseSuppression(enabled: boolean): Promise<void> {
    this.noiseEnabled = enabled
    const mic = this.mic
    if (!mic || !this.room) return
    if (enabled) {
      await this.recaptureMic(mic, true)
      await this.attachNoise(mic)
    } else {
      await mic.stopProcessor()
      this.gainControl = null
      await this.recaptureMic(mic, false)
      this.onNoiseModeChange?.('off')
      if (this.micGain !== 1) await this.attachGain(mic)
    }
  }

  async setMicGain(gain: number): Promise<void> {
    this.micGain = clampMicGain(gain)
    if (this.gainControl) return this.gainControl.setGain(this.micGain)
    if (this.mic && this.room && !this.noiseEnabled && this.micGain !== 1) await this.attachGain(this.mic)
  }

  setOutputVolume(volume: number): void {
    this.outputVolume = clampOutputVolume(volume)
    for (const track of this.remoteAudio) this.applyVolume(track)
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
      this.applyVolume(track)
    }
    this.onLevelerGains?.({})
  }

  private muteElements(track: RemoteTrack): void {
    const muted = this.deafened || this.leveled.has(track)
    track.attachedElements.forEach((el) => (el.muted = muted))
  }

  private async attachProcessor(mic: LocalAudioTrack): Promise<void> {
    if (this.noiseEnabled) await this.attachNoise(mic)
    else if (this.micGain !== 1) await this.attachGain(mic)
  }

  private openAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = this.deps.createAudioContext()
      this.clockWatchdog = this.deps.createClockWatchdog(this.audioContext)
    }
    return this.audioContext
  }

  private closeAudioContext(): void {
    this.clockWatchdog?.stop()
    this.clockWatchdog = null
    const ctx = this.audioContext
    this.audioContext = null
    if (ctx) void ctx.close().catch(() => {})
  }

  private async attachGain(mic: LocalAudioTrack): Promise<void> {
    try {
      await mic.setAudioContext(this.openAudioContext())
      const processor = this.deps.createGainProcessor(this.micGain)
      await mic.setProcessor(processor)
      this.gainControl = processor
    } catch (err) {
      this.gainControl = null
      console.warn('[voz] não foi possível ajustar o volume do microfone:', err)
    }
  }

  private async attachNoise(mic: LocalAudioTrack): Promise<void> {
    try {
      await mic.setAudioContext(this.openAudioContext())
      const processor = this.deps.createNoiseProcessor((mode) => this.onNoiseModeChange?.(mode), this.micGain)
      await mic.setProcessor(processor)
      this.gainControl = processor
    } catch (err) {
      this.gainControl = null
      console.warn('[ruído] não foi possível ligar o filtro automático:', err)
      this.onNoiseModeChange?.('light-fallback')
    }
  }

  private async recaptureMic(mic: LocalAudioTrack, nativeSuppression: boolean): Promise<void> {
    try {
      await mic.restartTrack(micCapture(this.inputDeviceId, nativeSuppression))
    } catch (err) {
      console.warn('[ruído] não foi possível reabrir o microfone para trocar a supressão nativa:', err)
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

  private applyVolume(track: RemoteTrack): void {
    const voiceOwner = this.voices.get(track)
    if (voiceOwner !== undefined && this.leveled.has(track)) return this.leveler?.setVolume(track, this.volumeOf(voiceOwner))
    const volume = this.ownVolumeOf(track, voiceOwner) * this.outputVolume
    ;(track as RemoteTrack & { setVolume?: (v: number) => void }).setVolume?.(volume)
  }

  private ownVolumeOf(track: RemoteTrack, voiceOwner: string | undefined): number {
    if (voiceOwner !== undefined) return this.mutedUsers.has(voiceOwner) ? 0 : (this.volumes.get(voiceOwner) ?? 1)
    const screenOwner = this.screenAudio.get(track)?.accountId
    if (screenOwner === undefined) return 1
    return this.mutedScreens.has(screenOwner) ? 0 : (this.screenVolumes.get(screenOwner) ?? 1)
  }

  private volumeOf(accountId: string): number {
    if (this.deafened || this.mutedUsers.has(accountId)) return 0
    return (this.volumes.get(accountId) ?? 1) * this.outputVolume
  }

  async startScreenShare(audioChoice: ScreenAudioChoice): Promise<void> {
    const room = this.room
    if (!room) throw new Error('Entre numa sala de voz para compartilhar a tela')
    const withAudio = audioChoice === 'with-system-audio'
    await room.localParticipant.setScreenShareEnabled(true, { ...SCREEN_CAPTURE, audio: withAudio, systemAudio: withAudio ? 'include' : 'exclude' })
  }

  async stopScreenShare(): Promise<void> {
    await this.room?.localParticipant.setScreenShareEnabled(false)
  }

  showOwnScreen(ownScreenShare: OwnScreenShare): void {
    useApp.setState({ ownScreenShare })
    this.publishScreens()
  }

  attachScreen(userId: string, el: HTMLVideoElement): () => void {
    const track = this.screens.get(userId)
    if (!track) return () => {}
    track.attach(el)
    return () => void track.detach(el)
  }

  screenMediaTrack(userId: string): MediaStreamTrack | undefined {
    return this.screens.get(userId)?.mediaStreamTrack
  }

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

  attachCamera(userId: string, el: HTMLVideoElement): () => void {
    const track = this.cameras.get(userId)
    if (!track) return () => {}
    track.attach(el)
    return () => void track.detach(el)
  }

  private bindRoom(room: Room): void {
    room
      .on(RoomEvent.TrackPublished, (publication: RemoteTrackPublication, participant: RemoteParticipant) =>
        this.subscribeUnlessOwnScreen(publication, participant)
      )
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: Participant) => {
        const owner = this.trackOwner(participant, track)
        if (owner) this.addRemoteTrack(track, owner)
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: Participant) => {
        if (track.kind === Track.Kind.Video) {
          if (track.source === Track.Source.Camera) return this.removeCamera(participant.identity, track)
          return this.removeScreenTrack(track)
        }
        if (track.source === Track.Source.Microphone && participant) this.speakingDetector?.unwatch(participant.identity)
        this.voices.delete(track)
        if (this.screenAudio.delete(track)) this.publishScreenAudio()
        if (this.leveled.delete(track)) this.leveler?.remove(track)
        if (!this.remoteAudio.delete(track)) return
        track.detach().forEach((el) => el.remove())
      })
      .on(RoomEvent.LocalTrackPublished, (pub: LocalTrackPublication, participant: Participant) => {
        if (pub.source === Track.Source.ScreenShare && pub.track) this.addScreen(participant.identity, pub.track)
        if (pub.source === Track.Source.Camera && pub.track) this.addCamera(participant.identity, pub.track)
      })
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
      .on(RoomEvent.Reconnecting, () => console.warn('[voz] conexão instável, reconectando...'))
      .on(RoomEvent.Reconnected, () => console.info('[voz] reconectado'))
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        if (this.room !== room) return
        if (this.connecting === room) return
        if (this.switchingFrom === room) {
          this.switchDropped = true
          return
        }
        console.warn('[voz] desconectado do LiveKit:', reason)
        this.leave()
        this.onUnexpectedDisconnect?.(describeDisconnect(reason))
      })
  }

  private addRemoteTrack(track: RemoteTrack, participant: ScreenOwner): void {
    if (track.kind === Track.Kind.Video) {
      if (track.source === Track.Source.ScreenShare) this.addScreen(participant.identity, track)
      else if (track.source === Track.Source.Camera && !track.isMuted) this.addCamera(participant.identity, track)
      return
    }
    const el = track.attach()
    el.muted = this.deafened
    this.remoteAudio.add(track)
    if (track.source === Track.Source.Microphone) {
      this.detector().watch(participant.identity, () => track.mediaStreamTrack)
    }
    const accountId = volumeIdOf(participant)
    if (track.source === Track.Source.Microphone && accountId) {
      this.voices.set(track, accountId)
      if (this.levelerEnabled) this.level(track, accountId)
      else this.applyVolume(track)
      return
    }
    if (track.source === Track.Source.ScreenShareAudio) {
      this.screenAudio.set(track, { identity: participant.identity, accountId })
      this.publishScreenAudio()
    }
    this.applyVolume(track)
  }

  private trackOwner(participant: Participant, track: RemoteTrack): ScreenOwner | null {
    const screenOf = screenOwnerOf(participant.identity, participant.metadata)
    if (screenOf === null) return participant
    return isScreenTrack(track.source) ? this.memberOfAccount(screenOf) : null
  }

  private memberOfAccount(accountId: string): ScreenOwner {
    const members = [...(this.room?.remoteParticipants.values() ?? [])]
    const member = members.find((candidate) => candidate.attributes?.accountId === accountId && screenOwnerOf(candidate.identity) === null)
    return member ?? { identity: accountId, attributes: { accountId } }
  }

  private subscribeUnlessOwnScreen(publication: RemoteTrackPublication, participant: RemoteParticipant): void {
    const screenOf = screenOwnerOf(participant.identity, participant.metadata)
    if (screenOf !== null && screenOf === useApp.getState().self?.accountId) return
    publication.setSubscribed(true)
  }

  private subscribeToPresent(room: Room): void {
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) this.subscribeUnlessOwnScreen(publication, participant)
    }
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

  private removeScreenTrack(track: Track): void {
    const owner = [...this.screens].find(([, screen]) => screen === track)?.[0]
    if (owner !== undefined) this.removeScreen(owner, track)
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

  private publishCameras(): void {
    const next = [...this.cameras.keys()]
    const prev = useApp.getState().cameras
    if (prev.length !== next.length || next.some((id, i) => prev[i] !== id)) useApp.setState({ cameras: next })
  }

  private publishScreenAudio(): void {
    const next = [...new Set([...this.screenAudio.values()].map((owner) => owner.identity))]
    const prev = useApp.getState().screenAudio
    if (prev.length !== next.length || next.some((id, i) => prev[i] !== id)) useApp.setState({ screenAudio: next })
  }

  private publishScreens(): void {
    const { self, ownScreenShare } = useApp.getState()
    const ownNativeScreen = ownScreenShare.kind === 'native' && self && !this.screens.has(self.id) ? [self.id] : []
    const next = [...this.screens.keys(), ...ownNativeScreen]
    const prev = useApp.getState().screens
    if (prev.length !== next.length || next.some((id, i) => prev[i] !== id)) useApp.setState({ screens: next })
  }

  private detector(): SpeakingDetector {
    if (!this.speakingDetector) {
      const detector = new SpeakingDetector()
      detector.onChange = (ids) => {
        this.measuredSpeakers = ids
        this.publishSpeaking()
      }
      this.speakingDetector = detector
    }
    return this.speakingDetector
  }

  private publishSpeaking(): void {
    const selfId = useApp.getState().self?.id
    const next: Record<string, boolean> = {}
    for (const id of this.measuredSpeakers) {
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
