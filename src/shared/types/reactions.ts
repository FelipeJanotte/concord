/**
 * CONTRATO — reações em mensagens (v6, A16).
 *
 * Cada pessoa pode reagir com vários emojis diferentes na mesma mensagem (um de cada). O servidor
 * guarda quem reagiu com o quê e manda a lista inteira da mensagem a cada mudança, para todos que
 * veem o canal. Reagir exige poder mandar mensagem no canal.
 */
import type { OkResult } from './permissions'

/** Tamanho máximo do emoji, em code points (a mesma conta do `char_length` do banco). */
export const REACTION_EMOJI_MAX = 8
/** Quantos emojis diferentes uma mensagem pode ter. */
export const REACTIONS_PER_MESSAGE_MAX = 20

export interface Reaction {
  emoji: string
  /** quem reagiu (contas), na ordem em que reagiram; o tamanho é a contagem */
  accountIds: string[]
}

/**
 * Regra do emoji, igual no servidor e na tela: sem espaços nem caracteres de controle, de 1 a
 * `REACTION_EMOJI_MAX` code points. Devolve o emoji limpo ou null (inválido).
 */
export function cleanReactionEmoji(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const emoji = raw.trim()
  if (!emoji || /[\s\u0000-\u001f\u007f]/.test(emoji)) return null
  return [...emoji].length <= REACTION_EMOJI_MAX ? emoji : null
}

// ---------- Eventos ----------

export interface ReactionsServerEvents {
  /** as reações de uma mensagem mudaram (lista inteira, para quem vê o canal) */
  'message:reactions': (payload: { channelId: string; messageId: string; reactions: Reaction[] }) => void
}

export interface ReactionsClientEvents {
  /** liga (`on: true`) ou tira a minha reação com esse emoji */
  'message:react': (payload: { messageId: string; emoji: string; on: boolean }, ack: (res: OkResult) => void) => void
}
