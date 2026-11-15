// Atualização automática (A13). Não é evento do Socket.IO: vai pela ponte do preload até o
// processo principal (`src/main/updater.ts`), que usa o electron-updater com os GitHub Releases.

export type UpdateStatus =
  /** nada a fazer (app em dia, ou rodando em modo dev, onde não atualiza) */
  | { state: 'idle' }
  | { state: 'checking' }
  /** baixando a versão nova em segundo plano */
  | { state: 'downloading'; version: string; percent: number }
  /** baixada: aplica ao reiniciar (ou sozinha ao fechar o app) */
  | { state: 'ready'; version: string }
  /** falhou (sem internet, release sem o arquivo...): tenta de novo na próxima verificação */
  | { state: 'error'; message: string }

/** De quanto em quanto tempo o app procura versão nova enquanto está aberto. */
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

export interface UpdaterBridge {
  /** situação atual (para a tela que abriu depois do aviso) */
  getStatus: () => Promise<UpdateStatus>
  /** avisa a cada mudança; devolve a função que para de ouvir */
  onStatus: (listener: (status: UpdateStatus) => void) => () => void
  check: () => void
  /** fecha o app, instala a versão baixada e abre de novo */
  install: () => void
}
