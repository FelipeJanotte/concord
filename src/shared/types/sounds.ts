/**
 * Efeitos sonoros da comunidade (soundboard) — A10 servidor / B17 tela.
 *
 * Envio por HTTP, como os anexos: `POST /sounds` com o corpo = bytes do áudio,
 * `Authorization: Bearer <token>`, `X-Sound-Name` e `X-Sound-Emoji` (opcional), ambos
 * com `encodeURIComponent`. O servidor confere o tipo pelos bytes (MP3/OGG/WAV/WebM),
 * o tamanho (512 KB) e a duração lida do arquivo (até 5 s).
 *
 * Tocar: quem está numa sala de voz manda `sound:play`; o servidor repassa
 * `sound:played` só para quem está naquela sala, e cada app toca localmente pela
 * saída escolhida (respeitando deafen e o volume de quem tocou).
 * Decisão sobre sobreposição: a mesma conta só toca outro som depois que o anterior
 * terminou (o servidor recusa com "Espere o som anterior terminar").
 */

export const SOUND_MAX_BYTES = 512 * 1024
export const SOUND_MAX_DURATION_MS = 5000
export const SOUND_NAME_MAX = 32
/** Emoji (ou poucos caracteres) que aparece no botão do som. */
export const SOUND_EMOJI_MAX = 8

/** Tipos aceitos (conferidos pelos bytes; o Content-Type do app não decide). */
export const SOUND_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'] as const
export type SoundType = (typeof SOUND_TYPES)[number]

export interface Sound {
  id: string
  name: string
  emoji: string | null
  durationMs: number
  /** conta de quem enviou (null se a conta não existe mais) */
  uploaderId: string | null
  /** caminho no servidor, assinado para quem recebe (`/sounds/<id>?a=…&e=…&s=…`) */
  url: string
}

/** Resposta de `POST /sounds`. */
export type SoundUploadResult = { ok: true; sound: Sound } | { ok: false; error: string }

export type SoundResult = { ok: true } | { ok: false; error: string }

// ---------- Eventos ----------

export interface SoundsServerEvents {
  /** som novo na coleção (para todos) */
  'sound:created': (sound: Sound) => void
  /** som apagado (para todos) */
  'sound:deleted': (soundId: string) => void
  /** alguém tocou um som na sala de voz em que ESTA conexão está */
  'sound:played': (payload: { channelId: string; soundId: string; by: string; accountId: string }) => void
}

export interface SoundsClientEvents {
  /** a coleção inteira (links assinados para quem pede) */
  'sound:list': (ack: (sounds: Sound[]) => void) => void
  /** exige estar na sala `channelId` e poder falar nela (`speak`) */
  'sound:play': (payload: { channelId: string; soundId: string }, ack: (res: SoundResult) => void) => void
  /** o autor ou quem tem `manageMessages` */
  'sound:delete': (soundId: string, ack: (res: SoundResult) => void) => void
}
