// Salas de voz e sinalização WebRTC.

export interface VoiceState {
  userId: string
  channelId: string
  muted: boolean
  deafened: boolean
}

export interface IceCandidate {
  candidate?: string
  sdpMid?: string | null
  sdpMLineIndex?: number | null
  usernameFragment?: string | null
}

export type SignalData =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'candidate'; candidate: IceCandidate }

/**
 * `canSpeak` false: entra só para ouvir (não envia o microfone).
 * `canShare` false: sem compartilhar a tela. O servidor decide pelas permissões do canal.
 */
export type JoinVoiceResult =
  | { ok: true; peers: string[]; canSpeak: boolean; canShare: boolean }
  | { ok: false; error: string }

// ---------- Eventos ----------

export interface VoiceServerEvents {
  /** sempre a lista completa */
  'voice:state': (voice: VoiceState[]) => void
  'voice:signal': (payload: { from: string; data: SignalData }) => void
  'voice:peer-left': (userId: string) => void
}

export interface VoiceClientEvents {
  'voice:join': (
    payload: { channelId: string; muted: boolean; deafened: boolean },
    ack: (res: JoinVoiceResult) => void
  ) => void
  'voice:leave': () => void
  'voice:update': (payload: { muted: boolean; deafened: boolean }) => void
  'voice:signal': (payload: { to: string; data: SignalData }) => void
}
