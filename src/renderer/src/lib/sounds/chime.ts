/**
 * Sons curtos da interface, gerados na hora pela Web Audio (sem arquivos de áudio:
 * nada para baixar, nenhuma licença para conferir e o app não cresce).
 *
 * - `join`: duas notas subindo (alguém entrou na sala);
 * - `leave`: as mesmas notas descendo (alguém saiu);
 * - `ptt-on`/`ptt-off`: uma nota curta, aguda/grave (pressione para falar abriu/fechou o microfone, B20).
 */
export type UiSound = 'join' | 'leave' | 'ptt-on' | 'ptt-off' | 'notify-dm' | 'notify-mention' | 'notify-friend'

/** Dó5 e Sol5: intervalo de quinta, soa "positivo" subindo e "fechando" descendo. */
const NOTES: Record<UiSound, number[]> = {
  join: [523.25, 783.99],
  leave: [783.99, 523.25],
  // Lá5 e Mi5, uma nota só: aviso discreto, toca a cada vez que a tecla é pressionada/solta
  'ptt-on': [880],
  'ptt-off': [659.25],
  'notify-dm': [987.77, 1318.51],
  'notify-mention': [1318.51, 987.77, 1318.51],
  'notify-friend': [659.25, 830.61, 987.77]
}
/** Atraso entre as duas notas e duração de cada uma (segundos). */
const NOTE_GAP = 0.09
const NOTE_LENGTH = 0.22
/** Volume máximo de verdade (o 100% da tela): som de aviso não deve assustar. */
const PEAK_GAIN = 0.25
/** O mesmo som repetido dentro desta janela vira um só (várias pessoas entrando juntas). */
export const MERGE_WINDOW_MS = 400

type SinkContext = AudioContext & { setSinkId?: (id: string) => Promise<void> }

export interface ChimeDeps {
  createContext: () => AudioContext
  now: () => number
}

const defaultDeps: ChimeDeps = {
  createContext: () => new AudioContext(),
  now: () => Date.now()
}

export class ChimePlayer {
  private ctx: SinkContext | null = null
  private sinkId: string | null = null
  private lastPlayed: Partial<Record<UiSound, number>> = {}
  private readonly deps: ChimeDeps

  constructor(deps: Partial<ChimeDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps }
  }

  /**
   * Toca o som. `volume` de 0 a 1; `outputId` = saída escolhida (null = padrão do sistema).
   * Devolve false quando não tocou (volume zero, repetido na janela de junção ou sem áudio).
   */
  play(sound: UiSound, opts: { volume: number; outputId: string | null }): boolean {
    const volume = Math.min(1, Math.max(0, opts.volume))
    if (volume === 0) return false
    const now = this.deps.now()
    const last = this.lastPlayed[sound]
    if (last !== undefined && now - last < MERGE_WINDOW_MS) return false
    this.lastPlayed[sound] = now

    try {
      const ctx = this.context()
      this.useOutput(ctx, opts.outputId)
      void ctx.resume?.()
      const start = ctx.currentTime
      NOTES[sound].forEach((freq, i) => this.note(ctx, freq, start + i * NOTE_GAP, volume * PEAK_GAIN))
      return true
    } catch (err) {
      console.warn('[sons] não foi possível tocar:', err)
      return false
    }
  }

  private context(): SinkContext {
    this.ctx ??= this.deps.createContext() as SinkContext
    return this.ctx
  }

  /** Mesma saída da voz (B4). Onde não dá para escolher, toca na padrão. */
  private useOutput(ctx: SinkContext, outputId: string | null): void {
    if (outputId === this.sinkId || !ctx.setSinkId) return
    this.sinkId = outputId
    ctx.setSinkId(outputId ?? '').catch((err) => console.warn('[sons] saída indisponível, usando a padrão:', err))
  }

  /** Uma nota senoidal com ataque rápido e queda suave (sem estalo). */
  private note(ctx: AudioContext, freq: number, at: number, gain: number): void {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, at)
    env.gain.setValueAtTime(0.0001, at)
    env.gain.exponentialRampToValueAtTime(gain, at + 0.01)
    env.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_LENGTH)
    osc.connect(env)
    env.connect(ctx.destination)
    osc.start(at)
    osc.stop(at + NOTE_LENGTH + 0.02)
  }
}
