import { rmsDb } from './leveler/level'

export const SENSITIVITY_MIN_DB = -100
export const SENSITIVITY_MAX_DB = 0
export const SENSITIVITY_DEFAULT_DB = -60
export const GATE_HOLD_MS = 300

export function clampSensitivity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return SENSITIVITY_DEFAULT_DB
  return Math.min(SENSITIVITY_MAX_DB, Math.max(SENSITIVITY_MIN_DB, value))
}

export interface GateState {
  open: boolean
  loudAt: number
}

export const CLOSED_GATE: GateState = { open: false, loudAt: -Infinity }

export function nextGate(state: GateState, levelDb: number, thresholdDb: number, now: number): GateState {
  if (levelDb >= thresholdDb) return { open: true, loudAt: now }
  return { open: now - state.loudAt < GATE_HOLD_MS, loudAt: state.loudAt }
}

export interface MicClock {
  now: () => number
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

export interface MicGateSettings {
  sensitivityDb: number
  onLevel: (db: number) => void
  clock: MicClock
}

const LEVEL_TICK_MS = 50
const GATE_OPEN_S = 0.005
const GATE_CLOSE_S = 0.05

export class MicGate {
  private readonly gateNode: GainNode
  private readonly analyser: AnalyserNode
  private readonly buffer: Float32Array<ArrayBuffer>
  private readonly timer: unknown
  private state: GateState = CLOSED_GATE
  private sensitivityDb: number

  constructor(
    private readonly ctx: AudioContext,
    input: AudioNode,
    output: AudioNode,
    private readonly settings: MicGateSettings
  ) {
    this.sensitivityDb = clampSensitivity(settings.sensitivityDb)
    this.gateNode = ctx.createGain()
    this.gateNode.gain.value = 0
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.buffer = new Float32Array(this.analyser.fftSize)
    input.connect(this.gateNode).connect(output)
    input.connect(this.analyser)
    this.timer = settings.clock.setInterval(() => this.measure(), LEVEL_TICK_MS)
  }

  setSensitivity(db: number): void {
    this.sensitivityDb = clampSensitivity(db)
  }

  destroy(): void {
    this.settings.clock.clearInterval(this.timer)
    this.gateNode.disconnect()
    this.analyser.disconnect()
  }

  private measure(): void {
    this.analyser.getFloatTimeDomainData(this.buffer)
    const db = rmsDb(this.buffer)
    this.settings.onLevel(db)
    const wasOpen = this.state.open
    this.state = nextGate(this.state, db, this.sensitivityDb, this.settings.clock.now())
    if (this.state.open === wasOpen) return
    const open = this.state.open
    this.gateNode.gain.setTargetAtTime(open ? 1 : 0, this.ctx.currentTime, open ? GATE_OPEN_S : GATE_CLOSE_S)
  }
}
