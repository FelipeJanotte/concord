import { describe, expect, it } from 'vitest'
import { nextSpeaking, SILENT, SPEAKING_HOLD_MS, SPEAKING_OFF_DB, SPEAKING_ON_DB } from './speaking'

const TICK = 50

function run(levels: number[], from = SILENT) {
  let state = from
  for (const db of levels) state = nextSpeaking(state, db, TICK)
  return state
}

describe('nextSpeaking', () => {
  it('acende quando o nível chega ao limiar de ligar', () => {
    expect(nextSpeaking(SILENT, SPEAKING_ON_DB, TICK).speaking).toBe(true)
    expect(nextSpeaking(SILENT, SPEAKING_ON_DB - 0.5, TICK).speaking).toBe(false)
  })

  it('silêncio total (-Infinity) não acende', () => {
    expect(nextSpeaking(SILENT, -Infinity, TICK)).toEqual(SILENT)
  })

  it('entre os limiares: quem falava continua aceso, quem estava quieto continua apagado', () => {
    const between = (SPEAKING_ON_DB + SPEAKING_OFF_DB) / 2
    const speaking = nextSpeaking(SILENT, SPEAKING_ON_DB, TICK)
    expect(run(Array(20).fill(between), speaking).speaking).toBe(true)
    expect(run(Array(20).fill(between)).speaking).toBe(false)
  })

  it('abaixo do limiar de desligar segura aceso pelo tempo de espera e só então apaga', () => {
    const speaking = nextSpeaking(SILENT, -20, TICK)
    const ticksToHold = SPEAKING_HOLD_MS / TICK
    expect(run(Array(ticksToHold - 1).fill(-80), speaking).speaking).toBe(true)
    expect(run(Array(ticksToHold).fill(-80), speaking)).toEqual(SILENT)
  })

  it('voltar a falar durante a espera zera a contagem (sem piscar entre as palavras)', () => {
    const speaking = nextSpeaking(SILENT, -20, TICK)
    const ticksToHold = SPEAKING_HOLD_MS / TICK
    const almost = run(Array(ticksToHold - 1).fill(-80), speaking)
    const again = nextSpeaking(almost, -20, TICK)
    expect(run(Array(ticksToHold - 1).fill(-80), again).speaking).toBe(true)
  })
})
