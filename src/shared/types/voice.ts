// Salas de voz. O áudio (e, na B3, a tela) passa pelo LiveKit (SFU); o servidor do
// Concord só valida a entrada, emite o token de acesso e mantém a lista de quem está em cada sala.

export interface VoiceState {
  /** id da conexão (socket.id). É também a identidade da pessoa na sala do LiveKit. */
  userId: string
  channelId: string
  muted: boolean
  deafened: boolean
  /** está compartilhando a tela (indicador "ao vivo"; a imagem em si vai pelo LiveKit) */
  sharing: boolean
  /**
   * silenciado por um moderador (B6): não fala em nenhuma sala até tirarem.
   * Ausente = false (servidor antigo). Quem está assim também aparece com `muted: true`.
   */
  serverMuted?: boolean
}

/** Como conectar na sala do LiveKit (sala = id do canal, identidade = `User.id`). */
export interface VoiceCredentials {
  /** endereço WebSocket do LiveKit, ex.: `ws://192.168.0.10:7880` */
  url: string
  /** JWT de acesso, válido só para esta sala e esta conexão; usado só para conectar */
  token: string
}

/**
 * Permissões da pessoa na sala (v2), decididas pelo servidor; o token do LiveKit já sai com elas.
 * `canSpeak` false: entra só para ouvir (não publica o microfone).
 * `canShare` false: não compartilha a tela.
 * `canVideo` false: não liga a câmera (B21).
 */
export interface VoicePermissions {
  canSpeak: boolean
  canShare: boolean
  canVideo: boolean
}

export type JoinVoiceResult = ({ ok: true } & VoiceCredentials & VoicePermissions) | { ok: false; error: string }

export type ScreenPreviewResult = { ok: true; image: string | null } | { ok: false; error: string }

export const SCREEN_PREVIEW_PREFIX = 'data:image/jpeg;base64,'
export const SCREEN_PREVIEW_MAX_CHARS = 200_000
export const SCREEN_PREVIEW_WIDTH = 480
export const SCREEN_PREVIEW_INTERVAL_MS = 5000

// ---------- Eventos ----------

export interface VoiceServerEvents {
  /** sempre a lista completa */
  'voice:state': (voice: VoiceState[]) => void
}

export interface VoiceClientEvents {
  'voice:join': (
    payload: { channelId: string; muted: boolean; deafened: boolean },
    ack: (res: JoinVoiceResult) => void
  ) => void
  'voice:leave': () => void
  'voice:update': (payload: { muted: boolean; deafened: boolean }) => void
  /** começou/parou de compartilhar a tela (só vale para quem está numa sala) */
  'voice:sharing': (sharing: boolean) => void
  'voice:preview': (image: string) => void
  'voice:preview-get': (userId: string, ack: (res: ScreenPreviewResult) => void) => void
}
