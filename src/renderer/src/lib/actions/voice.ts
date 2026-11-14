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
  screenPickerOpen: false
} as const

// A sala do LiveKit caiu sem a pessoa pedir (removida, sala encerrada, servidor de voz fora do ar).
voice.onUnexpectedDisconnect = (message) => {
  set({ ...OUT_OF_VOICE })
  leftVoiceRoom()
  notify(message)
}

// A tela parou sem ser pelo botão (janela compartilhada fechada, "parar" do sistema...).
voice.onScreenShareEnded = () => setSharing(false)

export function bindVoiceEvents(s: AppSocket): void {
  s.on('voice:state', (states) => {
    const prev = get().voice
    set({ voice: states })
    handleVoiceStateChange(prev, states)
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
    const { micError } = await voice.join(channelId)
    // Trocar de sala encerra a tela (o servidor também zera o "ao vivo").
    set({ myVoiceChannelId: channelId, noMic: micError !== null, sharing: false, screenPickerOpen: false })
    enteredVoiceRoom(channelId)
    if (micError !== null) {
      notify(`${describeMediaError(micError)} Você entrou só para ouvir.`, 'info')
    }
  } catch (err) {
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
  // Sem microfone, os outros sempre veem o usuário como silenciado.
  if (get().myVoiceChannelId) getSocket()?.emit('voice:update', { muted: muted || get().noMic, deafened })
}

export function toggleMute(): void {
  const { muted, deafened, noMic } = get()
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
