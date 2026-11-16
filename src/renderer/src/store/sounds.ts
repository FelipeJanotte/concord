// Efeitos sonoros da comunidade (soundboard, B17). A coleção vem do servidor (`sound:list`).
import type { Sound } from '@shared/types'

/** Um som tocando agora na minha sala (para o indicador "fulano tocou X"). */
export interface PlayingSound {
  soundId: string
  /** nome de quem tocou */
  by: string
  /** fim previsto (Date.now() + duração) */
  until: number
}

export interface SoundsState {
  /** a coleção da comunidade, em ordem de nome */
  sounds: Sound[]
  soundsLoaded: boolean
  /** quem está tocando um som agora na minha sala, por conta (a mesma conta não toca dois ao mesmo tempo) */
  soundsPlaying: Record<string, PlayingSound>
}

export const soundsInitial: SoundsState = {
  sounds: [],
  soundsLoaded: false,
  soundsPlaying: {}
}
