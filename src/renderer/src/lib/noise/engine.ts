/**
 * Motor do filtro avançado: RNNoise (MIT) em WASM + AudioWorklet, de
 * `@sapphi-red/web-noise-suppressor`. Os arquivos vão empacotados no app pelo Vite
 * (`?url`), sem baixar de CDN. Exige AudioContext a 48 kHz (o RNNoise só trabalha nessa taxa).
 *
 * O pacote só é carregado quando o filtro vai ligar (`import()`): ele estende `AudioWorkletNode` assim
 * que é importado, o que quebraria ambientes sem Web Audio (testes) e pesaria na abertura do app.
 *
 * Trocar de motor (ex.: GTCRN do mesmo pacote, ou DeepFilterNet3) = outra função com a mesma assinatura.
 */
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'

/** Nó de áudio do filtro avançado; `destroy` libera o WASM. */
export interface NoiseEngineNode {
  node: AudioNode
  destroy: () => void
}

export type NoiseEngineLoader = (ctx: AudioContext) => Promise<NoiseEngineNode>

let wasm: Promise<ArrayBuffer> | null = null
const loadedContexts = new WeakSet<BaseAudioContext>()

export const loadRnnoiseEngine: NoiseEngineLoader = async (ctx) => {
  const { loadRnnoise, RnnoiseWorkletNode } = await import('@sapphi-red/web-noise-suppressor')
  // O WASM é o mesmo para todas as salas: baixa (do próprio app) uma vez só.
  wasm ??= loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl }).catch((err) => {
    wasm = null
    throw err
  })
  const wasmBinary = await wasm
  if (!loadedContexts.has(ctx)) {
    await ctx.audioWorklet.addModule(rnnoiseWorkletUrl)
    loadedContexts.add(ctx)
  }
  const node = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 })
  return { node, destroy: () => node.destroy() }
}
