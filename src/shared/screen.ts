// Compartilhamento de tela: o que o processo principal do Electron mostra no seletor.
// (Não é evento do Socket.IO; vai pela ponte `window.api.screen`.)

export interface ScreenSource {
  /** id do desktopCapturer (ex.: `screen:0:0`, `window:1234:0`) */
  id: string
  name: string
  kind: 'screen' | 'window'
  /** miniatura em data URL (PNG) */
  thumbnail: string
  /** ícone do programa (só janelas), data URL ou null */
  appIcon: string | null
}

export interface ScreenShareBridge {
  /** telas e janelas disponíveis agora */
  getSources: () => Promise<ScreenSource[]>
  /** escolhe a fonte do próximo `getDisplayMedia` (chamado pelo LiveKit ao publicar a tela) */
  select: (sourceId: string, audio: boolean) => Promise<void>
  /** o sistema permite capturar o áudio junto (hoje só no Windows) */
  canShareAudio: boolean
}
