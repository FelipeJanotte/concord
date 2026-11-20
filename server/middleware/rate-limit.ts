
export interface LimitRule {
  capacity: number
  perSecond: number
}

export type TakeResult = { ok: true } | { ok: false; retryAfterMs: number }

interface Bucket {
  tokens: number
  updatedAt: number
}

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

export const LIMITS = {
  message: { capacity: 10, perSecond: 1 },
  upload: { capacity: 10, perSecond: 1 / 6 },
  channel: { capacity: 5, perSecond: 1 / 60 },
  profile: { capacity: 10, perSecond: 1 / 30 },
  friend: { capacity: 10, perSecond: 1 / 10 },
  dm: { capacity: 20, perSecond: 1 },
  vote: { capacity: 20, perSecond: 2 },
  reaction: { capacity: 20, perSecond: 2 },
  search: { capacity: 10, perSecond: 1 / 2 },
  pin: { capacity: 10, perSecond: 1 / 2 },
  read: { capacity: 30, perSecond: 2 },
  tool: { capacity: 5, perSecond: 1 / 3 },
  preferences: { capacity: 20, perSecond: 1 },
  sound: { capacity: 1, perSecond: 1 / 3 },
  music: { capacity: 5, perSecond: 1 / 5 },
  musicControl: { capacity: 10, perSecond: 1 },
  playlist: { capacity: 3, perSecond: 1 / 10 },
  moderation: { capacity: 20, perSecond: 1 },
  roleReorder: { capacity: 10, perSecond: 1 / 2 },
  call: { capacity: 5, perSecond: 1 / 10 },
  screenPreview: { capacity: 3, perSecond: 1 / 4 },
  screenPreviewGet: { capacity: 10, perSecond: 1 },
  screenWatching: { capacity: 10, perSecond: 2 },
  screenCredentials: { capacity: 5, perSecond: 1 / 10 },
  presence: { capacity: 5, perSecond: 1 / 10 },
  typing: { capacity: 5, perSecond: 1 / 2 },
  register: { capacity: 5, perSecond: 1 / 600 },
  login: { capacity: 20, perSecond: 1 / 15 }
} satisfies Record<string, LimitRule>

export type LimitName = keyof typeof LIMITS

export const limiters: Record<LimitName, RateLimiter> = Object.fromEntries(
  Object.entries(LIMITS).map(([name, rule]) => [name, new RateLimiter(rule)])
) as Record<LimitName, RateLimiter>

export function pruneAllLimiters(): void {
  for (const limiter of Object.values(limiters)) limiter.prune()
}

export function retryText(retryAfterMs: number): string {
  return `Tente de novo em ${Math.max(1, Math.ceil(retryAfterMs / 1000))} s.`
}
