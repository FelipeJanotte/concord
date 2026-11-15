// Atualização automática do app (A13): a situação que o processo principal manda.
import type { UpdateStatus } from '@shared/updater'

export interface UpdatesState {
  update: UpdateStatus
  /** a pessoa fechou o aviso "versão pronta" (volta na próxima versão) */
  updateDismissed: string | null
}

export const updatesInitial: UpdatesState = {
  update: { state: 'idle' },
  updateDismissed: null
}
