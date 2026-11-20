import type { ScreenShareBridge, ScreenShareEndReason, ScreenSource } from '@shared/screen'
import { get, getSocket, notify, requireSocket, set, type AppSocket } from '../core'
import { findDm } from '../dms'
import { voice } from '../voice'
import { enteredVoiceRoom, handleVoiceStateChange, leftVoiceRoom } from './voice-sounds'

export const OUT_OF_VOICE = {
  myVoiceChannelId: null,
  speaking: {},
  noMic: false,
  sharing: false,
  screenPickerOpen: false,
  cameraOn: false,
  voiceCanSpeak: true,
  voiceCanShare: true,
  voiceCanVideo: true
} as const

let mutedByModerator = false
const CANT_SPEAK_MODERATOR = 'Um moderador silenciou você nas salas de voz.'

voice.onUnexpectedDisconnect = (message) => {
  set({ ...OUT_OF_VOICE })
  leftVoiceRoom()
  notify(message)
}

voice.onScreenShareEnded = () => setSharing(false)

voice.onCameraEnded = () => set({ cameraOn: false })

voice.onPermissionsChange = ({ canSpeak, canShare, canVideo }) => {
  const was = get()
  set({ voiceCanSpeak: canSpeak, voiceCanShare: canShare, voiceCanVideo: canVideo })
  if (!canVideo && was.cameraOn) set({ cameraOn: false })
  if (was.voiceCanSpeak && !canSpeak) notify(mutedByModerator ? CANT_SPEAK_MODERATOR : 'Você não pode mais falar nesta sala.', 'info')
  if (!was.voiceCanSpeak && canSpeak) notify('Agora você pode falar nesta sala.', 'info')
  if (!canShare && was.sharing) setSharing(false)
  if (was.voiceCanSpeak !== canSpeak && was.myVoiceChannelId) {
    getSocket()?.emit('voice:update', { muted: was.muted || was.noMic || !canSpeak, deafened: was.deafened })
  }
}

export const UNMUTE_RESYNC_MS = 1500
function resyncAfterUnmute(): void {
  void voice.syncPermissions()
  setTimeout(() => {
    if (get().myVoiceChannelId && !get().voiceCanSpeak && !mutedByModerator) void voice.syncPermissions()
  }, UNMUTE_RESYNC_MS)
}

export function bindVoiceEvents(s: AppSocket): void {
  mutedByModerator = false
  s.on('voice:state', (states) => {
    const prev = get().voice
    set({ voice: states })
    handleVoiceStateChange(prev, states)
    const mine = states.find((v) => v.userId === get().self?.id)
    if (mine) {
      const wasMutedByModerator = mutedByModerator
      mutedByModerator = !!mine.serverMuted
      if (wasMutedByModerator && !mutedByModerator && !get().voiceCanSpeak) resyncAfterUnmute()
    }
    const { myVoiceChannelId, joiningVoice, self } = get()
    if (myVoiceChannelId && !joiningVoice && self && !states.some((v) => v.userId === self.id)) {
      voice.teardown()
      set({ ...OUT_OF_VOICE })
      leftVoiceRoom()
      notify('Você saiu da sala de voz.', 'info')
    }
  })
}

function describeMediaError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'Permissão de microfone negada.'
    if (err.name === 'NotFoundError') return 'Nenhum microfone encontrado.'
    if (err.name === 'NotReadableError') return 'O microfone está sendo usado por outro programa.'
  }
  return err instanceof Error ? err.message : 'Falha ao entrar no canal de voz'
}

export async function joinVoice(channelId: string, { show = true }: { show?: boolean } = {}): Promise<void> {
  const st = get()
  if (show && !findDm(st.dms, channelId)) set({ section: 'community', view: { kind: 'voice', channelId } })
  if (st.myVoiceChannelId === channelId || st.joiningVoice) return
  set({ joiningVoice: true })
  try {
    const { micError, cancelled, canSpeak, canShare, canVideo } = await voice.join(channelId)
    if (cancelled) return
    set({
      myVoiceChannelId: channelId,
      noMic: canSpeak && micError !== null,
      sharing: false,
      screenPickerOpen: false,
      cameraOn: false,
      voiceCanSpeak: canSpeak,
      voiceCanShare: canShare,
      voiceCanVideo: canVideo
    })
    enteredVoiceRoom(channelId)
    if (!canSpeak) {
      notify(
        mutedByModerator ? `${CANT_SPEAK_MODERATOR} Você entrou só para ouvir.` : 'Você não tem permissão para falar nesta sala: entrou só para ouvir.',
        'info'
      )
    }
    else if (micError !== null) notify(`${describeMediaError(micError)} Você entrou só para ouvir.`, 'info')
  } catch (err) {
    if (!voice.inRoom && get().myVoiceChannelId) {
      set({ ...OUT_OF_VOICE })
      leftVoiceRoom()
    }
    notify(describeMediaError(err))
  } finally {
    set({ joiningVoice: false })
  }
}

export function leaveVoice(): void {
  const bridge = screenBridge()
  if (bridge && get().sharing) void stopNativeShare(bridge)
  voice.leave()
  set({ ...OUT_OF_VOICE })
  leftVoiceRoom()
}

function applyAudio(muted: boolean, deafened: boolean): void {
  set({ muted, deafened })
  voice.setMuted(muted)
  voice.setDeafened(deafened)
  const { noMic, voiceCanSpeak } = get()
  if (get().myVoiceChannelId) getSocket()?.emit('voice:update', { muted: muted || noMic || !voiceCanSpeak, deafened })
}

export function toggleMute(): void {
  const { muted, deafened, noMic, voiceCanSpeak, myVoiceChannelId } = get()
  if (myVoiceChannelId && !voiceCanSpeak) {
    if (deafened) applyAudio(muted, false)
    else notify(mutedByModerator ? CANT_SPEAK_MODERATOR : 'Você não tem permissão para falar nesta sala.', 'info')
    return
  }
  if (noMic) {
    if (deafened) applyAudio(muted, false)
    else notify('Nenhum microfone disponível. Saia e entre de novo na sala depois de conectá-lo.', 'info')
    return
  }
  if (deafened) applyAudio(false, false)
  else applyAudio(!muted, false)
}

export function toggleDeafen(): void {
  const { deafened } = get()
  applyAudio(!deafened, !deafened)
}

function setSharing(sharing: boolean): void {
  if (get().sharing === sharing) return
  set({ sharing })
  if (get().myVoiceChannelId) getSocket()?.emit('voice:sharing', sharing)
}

function screenBridge() {
  return typeof window !== 'undefined' ? window.api?.screen : undefined
}

export function canShareSystemAudio(): boolean {
  return screenBridge()?.canShareAudio ?? false
}

export function attachScreen(userId: string, el: HTMLVideoElement): () => void {
  return voice.attachScreen(userId, el)
}

export function closeScreenPicker(): void {
  set({ screenPickerOpen: false })
}

export function toggleScreenShare(): void {
  const { sharing, myVoiceChannelId } = get()
  if (!myVoiceChannelId) return notify('Entre numa sala de voz para compartilhar a tela.', 'info')
  if (!get().voiceCanShare) return notify('Você não tem permissão para compartilhar a tela nesta sala.', 'info')
  if (sharing) return void stopScreenShare()
  if (screenBridge()) set({ screenPickerOpen: true })
  else void startScreenShare(null, false)
}

export async function startScreenShare(source: ScreenSource | null, audio: boolean): Promise<void> {
  set({ screenPickerOpen: false })
  try {
    const bridge = screenBridge()
    if (bridge && source) await startNativeShare(bridge, source, audio)
    else await voice.startScreenShare(audio)
    setSharing(true)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') return
    console.error('[tela] não foi possível compartilhar:', err)
    notify(err instanceof Error && err.message ? `Não foi possível compartilhar a tela: ${err.message}` : 'Não foi possível compartilhar a tela.')
  }
}

let stopListeningForNativeEnd: (() => void) | null = null

async function startNativeShare(bridge: ScreenShareBridge, source: ScreenSource, audio: boolean): Promise<void> {
  const credentials = await requireSocket().emitWithAck('voice:screen-credentials')
  if (!credentials.ok) throw new Error(credentials.error)
  stopListeningForNativeEnd?.()
  stopListeningForNativeEnd = bridge.onEnded(nativeShareEnded)
  await bridge.start({ sourceId: source.id, audio: audio && bridge.canShareAudio, url: credentials.url, token: credentials.token })
  voice.showOwnScreen(source.thumbnail)
}

const NATIVE_END_NOTICES: Partial<Record<ScreenShareEndReason, { text: string; kind: 'error' | 'info' }>> = {
  'source-closed': { text: 'A janela compartilhada foi fechada', kind: 'info' },
  failed: { text: 'O compartilhamento de tela parou', kind: 'error' }
}

function nativeShareEnded(reason: ScreenShareEndReason): void {
  const wasSharing = get().sharing
  voice.showOwnScreen(null)
  setSharing(false)
  const notice = NATIVE_END_NOTICES[reason]
  if (wasSharing && notice) notify(notice.text, notice.kind)
}

async function stopNativeShare(bridge: ScreenShareBridge): Promise<void> {
  try {
    await bridge.stop()
  } catch (err) {
    console.error('[tela] não foi possível parar a tela nativa:', err)
  } finally {
    voice.showOwnScreen(null)
  }
}

export async function stopScreenShare(): Promise<void> {
  const bridge = screenBridge()
  try {
    if (bridge) await stopNativeShare(bridge)
    else await voice.stopScreenShare()
  } finally {
    setSharing(false)
  }
}

export function attachCamera(userId: string, el: HTMLVideoElement): () => void {
  return voice.attachCamera(userId, el)
}

function describeCameraError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'Permissão de câmera negada.'
    if (err.name === 'NotFoundError') return 'Nenhuma câmera encontrada.'
    if (err.name === 'NotReadableError') return 'A câmera está sendo usada por outro programa.'
  }
  return err instanceof Error && err.message ? `Não foi possível ligar a câmera: ${err.message}` : 'Não foi possível ligar a câmera.'
}

export async function toggleCamera(): Promise<void> {
  const { cameraOn, myVoiceChannelId, voiceCanVideo } = get()
  if (!myVoiceChannelId) return notify('Entre numa sala de voz para ligar a câmera.', 'info')
  if (!cameraOn && !voiceCanVideo) return notify('Você não tem permissão para ligar a câmera nesta sala.', 'info')
  try {
    await voice.setCamera(!cameraOn)
    set({ cameraOn: !cameraOn })
  } catch (err) {
    console.error('[câmera] falhou:', err)
    if (!cameraOn) notify(describeCameraError(err))
    else set({ cameraOn: false })
  }
}
