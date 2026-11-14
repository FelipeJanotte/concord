/**
 * Sons de entrada e saída na sala de voz (B16). Só cliente: compara o `voice:state`
 * anterior com o novo na MINHA sala. Os sons da própria pessoa tocam em `joinVoice`/`leaveVoice`.
 *
 * Não toca: fora de uma sala, na carga inicial (`hello` não passa por aqui), com deafen ou com o
 * interruptor desligado. Quem já estava na sala quando entro não conta como "entrou": a lista
 * anterior já tem essas pessoas, e a própria conexão fica fora da comparação. Várias pessoas entrando juntas viram um som só (`MERGE_WINDOW_MS` no ChimePlayer).
 */
import type { VoiceState } from '@shared/types'
import { ChimePlayer, type UiSound } from '../sounds/chime'
import { roomChanges } from '../sounds/transitions'
import { get } from '../core'

export const chimes = new ChimePlayer()

/** Sala em que entrei (só para o som de saída tocar uma vez e só se eu estava numa sala). */
let watchedChannel: string | null = null

/** Toca um som da interface respeitando o interruptor, o volume, o deafen e a saída escolhida. */
export function playVoiceSound(sound: UiSound): void {
  const st = get()
  if (!st.voiceSoundsEnabled || st.deafened) return
  chimes.play(sound, { volume: st.voiceSoundsVolume, outputId: st.audioOutputId })
}

/** Botão "Testar" das configurações: toca mesmo com o interruptor desligado. */
export function previewVoiceSound(): void {
  const st = get()
  chimes.play('join', { volume: st.voiceSoundsVolume, outputId: st.audioOutputId })
}

/** Entrei numa sala (ou troquei): passa a acompanhar essa e toca o som de entrada. */
export function enteredVoiceRoom(channelId: string): void {
  watchedChannel = channelId
  playVoiceSound('join')
}

/** Saí da sala (pelo botão, removido ou queda): para de acompanhar e toca o som de saída. */
export function leftVoiceRoom(): void {
  if (watchedChannel === null) return
  watchedChannel = null
  playVoiceSound('leave')
}

/** Chamado a cada `voice:state` com a lista anterior e a nova. */
export function handleVoiceStateChange(prev: VoiceState[], next: VoiceState[]): void {
  const my = get().myVoiceChannelId
  if (!my) return
  const { joined, left } = roomChanges(prev, next, my, get().self?.id)
  if (joined.length) playVoiceSound('join')
  if (left.length) playVoiceSound('leave')
}

/** Só para testes: esquece a sala acompanhada. */
export function resetVoiceSoundsForTests(): void {
  watchedChannel = null
}
