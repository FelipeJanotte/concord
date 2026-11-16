export const CLOCK_CHECK_MS = 2000
export const MIN_CLOCK_RATE = 0.9
export const SLOW_CHECKS_TO_RECOVER = 2

export type WatchedContext = Pick<AudioContext, 'currentTime' | 'state' | 'suspend' | 'resume'>

export interface ClockWatchdogDeps {
  now: () => number
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
  onRecover: (rate: number) => void
}

export class AudioClockWatchdog {
  private timer: unknown = null
  private lastWallMs = 0
  private lastCtxTime = 0
  private slowChecks = 0
  private recovering = false
  private suspendedByMe = false

  constructor(
    private readonly ctx: WatchedContext,
    private readonly deps: ClockWatchdogDeps
  ) {}

  start(): void {
    this.resetBaseline()
    this.timer = this.deps.setInterval(() => void this.check(), CLOCK_CHECK_MS)
  }

  stop(): void {
    if (this.timer !== null) this.deps.clearInterval(this.timer)
    this.timer = null
  }

  private resetBaseline(): void {
    this.lastWallMs = this.deps.now()
    this.lastCtxTime = this.ctx.currentTime
    this.slowChecks = 0
  }

  private async check(): Promise<void> {
    if (this.timer === null || this.recovering) return
    if (this.ctx.state !== 'running') {
      if (this.suspendedByMe) await this.recover(null)
      else this.resetBaseline()
      return
    }
    const wallSeconds = (this.deps.now() - this.lastWallMs) / 1000
    const rate = wallSeconds > 0 ? (this.ctx.currentTime - this.lastCtxTime) / wallSeconds : 1
    this.lastWallMs = this.deps.now()
    this.lastCtxTime = this.ctx.currentTime
    this.slowChecks = rate < MIN_CLOCK_RATE ? this.slowChecks + 1 : 0
    if (this.slowChecks >= SLOW_CHECKS_TO_RECOVER) await this.recover(Math.round(rate * 100) / 100)
  }

  private async recover(rate: number | null): Promise<void> {
    this.recovering = true
    try {
      if (!this.suspendedByMe) {
        await this.ctx.suspend()
        this.suspendedByMe = true
      }
      await this.ctx.resume()
      this.suspendedByMe = false
      if (rate !== null) this.deps.onRecover(rate)
    } catch {
      return
    } finally {
      this.recovering = false
      this.resetBaseline()
    }
  }
}
