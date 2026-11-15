// Chamadas privadas em andamento (B8): uma por conversa, chave = id do canal `dm`.
import type { CallInfo } from '@shared/types'

export interface CallsState {
  calls: Record<string, CallInfo>
}

export const callsInitial: CallsState = {
  calls: {}
}
