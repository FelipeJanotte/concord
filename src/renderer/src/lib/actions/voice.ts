// Entrar/sair da sala de voz, mute, deafen e compartilhar a tela. A conexão com o LiveKit fica em `lib/voice.ts`.
import { get, getSocket, notify, set, type AppSocket } from '../core'
import { voice } from '../voice'
import { enteredVoiceRoom, handleVoiceStateChange, leftVoiceRoom } from './voice-sounds'

/** Estado de quem não está em nenhuma sala (sair, cair, perder a conexão). */
export const OUT_OF_VOICE = {
  myVoiceChannelId: null,
  speaking: {},
  noMic: false,
  sharing: false,
  screenPickerOpen: false,
  voiceCanSpeak: true,
  voiceCanShare: true
} as const

// A sala do LiveKit caiu sem a pessoa pedir (removida, sala encerrada, servidor de voz fora do ar).
voice.onUnexpectedDisconnect = (message) => {
  set({ ...OUT_OF_VOICE })
  leftVoiceRoom()
  notify(message)
}

// A tela parou sem ser pelo botão (janela compartilhada fechada, "parar" do sistema...).
voice.onScreenShareEnded = () => setSharing(false)

// Cargo/regra mudou com a pessoa na sala (v2): o LiveKit já trocou o que ela pode publicar.
voice.onPermissionsChange = ({ canSpeak, canShare }) => {
  const was = get()
  set({ voiceCanSpeak: canSpeak, voiceCanShare: canShare })
  if (was.voiceCanSpeak && !canSpeak) notify('Você não pode mais falar nesta sala.', 'info')
  if (!was.voiceCanSpeak && canSpeak) notify('Agora você pode falar nesta sala.', 'info')
  if (!canShare && was.sharing) setSharing(false)
  // O servidor deixa quem não pode falar sempre silenciado; ao recuperar, avisa o estado real.
  if (was.voiceCanSpeak !== canSpeak && was.myVoiceChannelId) {
    getSocket()?.emit('voice:update', { muted: was.muted || was.noMic || !canSpeak, deafened: was.deafened })
  }
}

export function bindVoiceEvents(s: AppSocket): void {
  s.on('voice:state', (states) => {
    const prev = get().voice
    set({ voice: states })
    handleVoiceStateChange(prev, states) // sons de entrar/sair (B16)
    // O servidor tirou esta conexão da sala (ex.: perdeu a permissão de entrar, v2): sai localmente.
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

export async function joinVoice(channelId: string): Promise<void> {
  const st = get()
  set({ view: { kind: 'voice', channelId } })
  if (st.myVoiceChannelId === channelId || st.joiningVoice) return
  set({ joiningVoice: true })
  try {
    const { micError, cancelled, canSpeak, canShare } = await voice.join(channelId)
    // Interrompida no meio (saiu, trocou de sala, conexão caiu): não grava a sala.
    if (cancelled) return
    // Trocar de sala encerra a tela (o servidor também zera o "ao vivo").
    set({
      myVoiceChannelId: channelId,
      noMic: canSpeak && micError !== null,
      sharing: false,
      screenPickerOpen: false,
      voiceCanSpeak: canSpeak,
      voiceCanShare: canShare
    })
    enteredVoiceRoom(channelId)
    if (!canSpeak) notify('Você não tem permissão para falar nesta sala: entrou só para ouvir.', 'info')
    else if (micError !== null) notify(`${describeMediaError(micError)} Você entrou só para ouvir.`, 'info')
  } catch (err) {
    // Troca recusada pelo servidor: a sala antiga continua de pé e o estado também.
    // Falha depois de aceita (LiveKit fora do ar): o VoiceClient já saiu de tudo; o estado acompanha.
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
  voice.leave()
  set({ ...OUT_OF_VOICE })
  leftVoiceRoom()
}

function applyAudio(muted: boolean, deafened: boolean): void {
  set({ muted, deafened })
  voice.setMuted(muted)
  voice.setDeafened(deafened)
  // Sem microfone ou sem permissão de falar, os outros sempre veem o usuário como silenciado.
  const { noMic, voiceCanSpeak } = get()
  if (get().myVoiceChannelId) getSocket()?.emit('voice:update', { muted: muted || noMic || !voiceCanSpeak, deafened })
}

export function toggleMute(): void {
  const { muted, deafened, noMic, voiceCanSpeak, myVoiceChannelId } = get()
  if (myVoiceChannelId && !voiceCanSpeak) {
    if (deafened) applyAudio(muted, false)
    else notify('Você não tem permissão para falar nesta sala.', 'info')
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

// ---------- Tela ----------

function setSharing(sharing: boolean): void {
  if (get().sharing === sharing) return
  set({ sharing })
  if (get().myVoiceChannelId) getSocket()?.emit('voice:sharing', sharing)
}

/** No Electron existe o seletor próprio; no navegador (npm run dev), o do próprio navegador. */
function screenBridge() {
  return typeof window !== 'undefined' ? window.api?.screen : undefined
}

export function canShareSystemAudio(): boolean {
  return screenBridge()?.canShareAudio ?? false
}

/** Liga a tela de `userId` num <video> (usado pelo ScreenTile). Devolve a função que desliga. */
export function attachScreen(userId: string, el: HTMLVideoElement): () => void {
  return voice.attachScreen(userId, el)
}

export function closeScreenPicker(): void {
  set({ screenPickerOpen: false })
}

/** Botão "Compartilhar tela": abre o seletor, ou para se já estiver compartilhando. */
export function toggleScreenShare(): void {
  const { sharing, myVoiceChannelId } = get()
  if (!myVoiceChannelId) return notify('Entre numa sala de voz para compartilhar a tela.', 'info')
  if (!get().voiceCanShare) return notify('Você não tem permissão para compartilhar a tela nesta sala.', 'info')
  if (sharing) return void stopScreenShare()
  if (screenBridge()) set({ screenPickerOpen: true })
  else void startScreenShare(null, false)
}

/**
 * Começa a compartilhar. `sourceId` vem do ScreenPicker (Electron); null = deixa o
 * navegador perguntar. `audio` = levar junto o áudio do sistema (só Windows).
 */
export async function startScreenShare(sourceId: string | null, audio: boolean): Promise<void> {
  set({ screenPickerOpen: false })
  try {
    const bridge = screenBridge()
    if (bridge && sourceId) await bridge.select(sourceId, audio && bridge.canShareAudio)
    await voice.startScreenShare(audio)
    setSharing(true)
  } catch (err) {
    // Cancelou o seletor do navegador: não é erro.
    if (err instanceof DOMException && err.name === 'NotAllowedError') return
    console.error('[tela] não foi possível compartilhar:', err)
    notify(err instanceof Error && err.message ? `Não foi possível compartilhar a tela: ${err.message}` : 'Não foi possível compartilhar a tela.')
  }
}

export async function stopScreenShare(): Promise<void> {
  try {
    await voice.stopScreenShare()
  } finally {
    setSharing(false)
  }
}
