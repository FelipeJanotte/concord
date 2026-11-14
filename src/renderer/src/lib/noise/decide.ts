/**
 * Decisão do modo automático da supressão de ruído (B13), sem nada de áudio: recebe
 * medições do nível do microfone e diz se o filtro avançado deve estar ligado.
 *
 * Ruído de fundo = um percentil baixo do nível dos últimos segundos. Fala é alta e
 * intermitente; o que fica no "fundo" das medições é o ruído constante do ambiente
 * (ventilador, teclado, rua). Assim não é preciso saber quando a pessoa está falando.
 */

/** Nível em dBFS (0 = máximo; silêncio digital ≈ -100). */
export function rmsToDb(rms: number): number {
  return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100
}

export interface DeciderOptions {
  /** ruído de fundo acima disso (por `enterMs`) liga o avançado */
  noisyDb: number
  /** abaixo disso (por `exitMs`) desliga; o vão entre os dois evita ficar alternando */
  quietDb: number
  enterMs: number
  exitMs: number
  /** janela de medições usada para o ruído de fundo */
  windowMs: number
  /** percentil (0–1) das medições que representa o fundo */
  percentile: number
}

export const DEFAULT_DECIDER: DeciderOptions = {
  noisyDb: -50,
  quietDb: -58,
  enterMs: 2000,
  exitMs: 10000,
  windowMs: 4000,
  percentile: 0.2
}

export class NoiseDecider {
  private samples: { at: number; db: number }[] = []
  private advanced = false
  /** desde quando a condição para trocar de modo vem se mantendo (null = não está) */
  private pendingSince: number | null = null
  private readonly opts: DeciderOptions

  constructor(opts: Partial<DeciderOptions> = {}, startAdvanced = false) {
    this.opts = { ...DEFAULT_DECIDER, ...opts }
    this.advanced = startAdvanced
  }

  get isAdvanced(): boolean {
    return this.advanced
  }

  /** Ruído de fundo atual (dBFS) ou null sem medições. */
  floorDb(): number | null {
    if (this.samples.length === 0) return null
    const sorted = this.samples.map((s) => s.db).sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * this.opts.percentile))]
  }

  /** Nova medição do nível do microfone. Devolve se o avançado deve estar ligado agora. */
  update(db: number, now: number): boolean {
    this.samples.push({ at: now, db })
    while (this.samples.length && now - this.samples[0].at > this.opts.windowMs) this.samples.shift()
    // Espera ter uma janela razoável antes de decidir qualquer coisa.
    if (now - this.samples[0].at < this.opts.windowMs / 2) return this.advanced

    const floor = this.floorDb()!
    const wantsChange = this.advanced ? floor < this.opts.quietDb : floor > this.opts.noisyDb
    if (!wantsChange) {
      this.pendingSince = null
      return this.advanced
    }
    this.pendingSince ??= now
    if (now - this.pendingSince >= (this.advanced ? this.opts.exitMs : this.opts.enterMs)) {
      this.advanced = !this.advanced
      this.pendingSince = null
    }
    return this.advanced
  }
}
