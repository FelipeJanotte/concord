/**
 * Atualização automática (A13), lado da janela: acompanha a situação que o processo principal manda
 * (`window.api.updater`) e pede para reiniciar e instalar. Fora do Electron, não faz nada.
 * Skill `concord-updates`.
 */
import type { UpdaterBridge } from '@shared/updater'
import { get, set } from '../core'

export const updatesEnv = {
  bridge: (): UpdaterBridge | null => (typeof window !== 'undefined' ? (window.api?.updater ?? null) : null)
}

let stop: (() => void) | null = null

/** Começa a acompanhar (uma vez, na abertura do app). */
export function startUpdates(): () => void {
  if (stop) return stop
  const bridge = updatesEnv.bridge()
  if (!bridge) return () => {}
  const off = bridge.onStatus((update) => set({ update }))
  void bridge
    .getStatus()
    .then((update) => set({ update }))
    .catch(() => {})
  stop = () => {
    off()
    stop = null
  }
  return stop
}

/** "Reiniciar para atualizar": o app fecha, instala a versão baixada e abre de novo. */
export function installUpdate(): void {
  if (get().update.state === 'ready') updatesEnv.bridge()?.install()
}

/** "Depois": esconde o aviso desta versão (ela entra sozinha quando o app fechar). */
export function dismissUpdate(): void {
  const update = get().update
  if (update.state === 'ready') set({ updateDismissed: update.version })
}
