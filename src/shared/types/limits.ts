// Limite de requisições (o servidor recusa ações rápidas demais).

/** Ação recusada por excesso, para o app mostrar o aviso certo. */
export type LimitedAction = 'message' | 'typing'

// ---------- Eventos ----------

export interface LimitsServerEvents {
  /**
   * `message:send` foi recusado por excesso (o envio também responde o erro; o aviso fica para o app antigo).
   * Ações com resposta (`channel:create`, `account:update`) e as rotas HTTP
   * (status 429) devolvem o erro direto.
   */
  'rate:limited': (payload: { action: LimitedAction; retryAfterMs: number }) => void
}
