/**
 * Limite de requisições por chave (conta, IP...) com "balde de fichas":
 * cada chave começa com `capacity` fichas, cada ação gasta uma e o balde
 * se enche de novo aos poucos (`perSecond`). Permite rajadas curtas e
 * segura abuso contínuo. Tudo em memória (zera ao reiniciar o servidor).
 */

export interface LimitRule {
  /** quantas ações seguidas são permitidas */
  capacity: number
  /** fichas devolvidas por segundo */
  perSecond: number
}

export type TakeResult = { ok: true } | { ok: false; retryAfterMs: number }

interface Bucket {
  tokens: number
  updatedAt: number
}

/** Multiplica a capacidade de todas as regras (testes usam um valor alto; produção, 1). */
const MULTIPLIER = Math.max(1, Number(process.env.RATE_LIMIT_MULTIPLIER) || 1)

export class RateLimiter {
  private buckets = new Map<string, Bucket>()
  private readonly capacity: number
  private readonly perMs: number

  constructor(
    rule: LimitRule,
    private readonly now: () => number = Date.now
  ) {
    this.capacity = rule.capacity * MULTIPLIER
    this.perMs = (rule.perSecond * MULTIPLIER) / 1000
  }

  /** Gasta uma ficha da chave, se houver. Senão diz em quanto tempo haverá. */
  take(key: string): TakeResult {
    const now = this.now()
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now }
    bucket.tokens = Math.min(this.capacity, bucket.tokens + (now - bucket.updatedAt) * this.perMs)
    bucket.updatedAt = now
    this.buckets.set(key, bucket)
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return { ok: true }
    }
    return { ok: false, retryAfterMs: Math.ceil((1 - bucket.tokens) / this.perMs) }
  }

  /** Esquece as chaves com balde cheio (não fazem diferença). Chamado de tempos em tempos. */
  prune(): void {
    const now = this.now()
    for (const [key, bucket] of this.buckets) {
      if (bucket.tokens + (now - bucket.updatedAt) * this.perMs >= this.capacity) this.buckets.delete(key)
    }
  }

  get size(): number {
    return this.buckets.size
  }
}

/** Regras do Concord. Ajuste aqui (valores pensados para um grupo de amigos). */
export const LIMITS = {
  /** mensagens por conta: rajada de 10, depois 1 por segundo */
  message: { capacity: 10, perSecond: 1 },
  /** envios de arquivo por conta: 10 seguidos, depois 1 a cada 6 s */
  upload: { capacity: 10, perSecond: 1 / 6 },
  /** canais criados por conta: 5 seguidos, depois 1 por minuto */
  channel: { capacity: 5, perSecond: 1 / 60 },
  channelLayout: { capacity: 20, perSecond: 1 },
  /** mudanças de perfil por conta: 10 seguidas, depois 1 a cada 30 s */
  profile: { capacity: 10, perSecond: 1 / 30 },
  /** pedidos de amizade por conta: 10 seguidos, depois 1 a cada 10 s (v3) */
  friend: { capacity: 10, perSecond: 1 / 10 },
  /** abrir conversa privada por conta: 20 seguidas, depois 1 por segundo (v3) */
  dm: { capacity: 20, perSecond: 1 },
  /** votos em enquete por conta: 20 seguidos, depois 2 por segundo (trocar de opção é comum) (v4) */
  vote: { capacity: 20, perSecond: 2 },
  /** reações por conta: 20 seguidas, depois 2 por segundo (ligar e desligar rápido é comum) (A16) */
  reaction: { capacity: 20, perSecond: 2 },
  search: { capacity: 10, perSecond: 1 / 2 },
  pin: { capacity: 10, perSecond: 1 / 2 },
  embed: { capacity: 10, perSecond: 1 / 3 },
  read: { capacity: 30, perSecond: 2 },
  /** sorteios das ferramentas do grupo por conta: 5 seguidos, depois 1 a cada 3 s (v4) */
  tool: { capacity: 5, perSecond: 1 / 3 },
  /** preferências (tema): 20 seguidas (arrastar o seletor de cor), depois 1 por segundo (v5) */
  preferences: { capacity: 20, perSecond: 1 },
  /** efeitos sonoros tocados por conta: 1 a cada 3 s (A10) */
  sound: { capacity: 1, perSecond: 1 / 3 },
  music: { capacity: 5, perSecond: 1 / 5 },
  musicControl: { capacity: 10, perSecond: 1 },
  playlist: { capacity: 3, perSecond: 1 / 10 },
  /** ações de moderação e apagar mensagem por conta: 20 seguidas, depois 1 por segundo (B6) */
  moderation: { capacity: 20, perSecond: 1 },
  roleReorder: { capacity: 10, perSecond: 1 / 2 },
  /** ligar para alguém (B8): 5 seguidas, depois 1 a cada 10 s (cada ligação toca na tela da outra pessoa) */
  call: { capacity: 5, perSecond: 1 / 10 },
  screenPreview: { capacity: 3, perSecond: 1 / 4 },
  screenPreviewGet: { capacity: 10, perSecond: 1 },
  screenWatching: { capacity: 10, perSecond: 2 },
  presence: { capacity: 5, perSecond: 1 / 10 },
  /** "digitando" por conexão (o app já manda no máximo 1 a cada 2,5 s) */
  typing: { capacity: 5, perSecond: 1 / 2 },
  /** cadastros por IP: 5 seguidos, depois 1 a cada 10 min */
  register: { capacity: 5, perSecond: 1 / 600 },
  /** tentativas de login por IP (além do bloqueio por e-mail) */
  login: { capacity: 20, perSecond: 1 / 15 }
} satisfies Record<string, LimitRule>

export type LimitName = keyof typeof LIMITS

/** Um limitador por regra, compartilhado pelo servidor todo. */
export const limiters: Record<LimitName, RateLimiter> = Object.fromEntries(
  Object.entries(LIMITS).map(([name, rule]) => [name, new RateLimiter(rule)])
) as Record<LimitName, RateLimiter>

export function pruneAllLimiters(): void {
  for (const limiter of Object.values(limiters)) limiter.prune()
}

/** "Tente de novo em N s." (arredonda para cima, mínimo 1 s). */
export function retryText(retryAfterMs: number): string {
  return `Tente de novo em ${Math.max(1, Math.ceil(retryAfterMs / 1000))} s.`
}
