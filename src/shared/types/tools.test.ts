// Texto por extenso do resultado do sorteador (vai no content da mensagem).
import { describe, expect, it } from 'vitest'
import { MESSAGE_MAX_LENGTH } from './message'
import { coinResultText, diceResultText, pickResultText, teamsResultText, toolResultText } from './tools'

describe('teamsResultText', () => {
  it('um time por linha, com a lane quando existe', () => {
    expect(
      teamsResultText({
        lanes: true,
        teams: [
          { members: [{ name: 'Ana', lane: 'top' }, { name: 'Bia', lane: 'support' }] },
          { members: [{ name: 'Caio', lane: 'mid' }] }
        ]
      })
    ).toBe('Times sorteados\nTime 1: Ana (Topo), Bia (Suporte)\nTime 2: Caio (Meio)')
    expect(teamsResultText({ lanes: false, teams: [{ members: [{ name: 'Ana' }] }, { members: [{ name: 'Bia' }] }] })).toBe(
      'Times sorteados\nTime 1: Ana\nTime 2: Bia'
    )
  })

  it('nunca passa do tamanho de uma mensagem', () => {
    const long = { name: 'x'.repeat(32), lane: 'support' as const }
    const text = teamsResultText({ lanes: true, teams: Array.from({ length: 10 }, () => ({ members: Array(5).fill(long) })) })
    expect(text.length).toBe(MESSAGE_MAX_LENGTH)
    expect(text.endsWith('…')).toBe(true)
  })
})

describe('textos das outras ferramentas', () => {
  it('dado: um dado mostra só o valor; vários mostram a soma', () => {
    expect(diceResultText({ sides: 20, rolls: [17], total: 17 })).toBe('🎲 d20: 17')
    expect(diceResultText({ sides: 6, rolls: [3, 5], total: 8 })).toBe('🎲 2d6: 3 + 5 = 8')
  })

  it('moeda: uma moeda; várias com a contagem (singular e plural)', () => {
    expect(coinResultText({ flips: ['coroa'] })).toBe('🪙 Coroa')
    expect(coinResultText({ flips: ['cara', 'coroa', 'cara'] })).toBe('🪙 Cara, coroa, cara (2 caras, 1 coroa)')
  })

  it('sortear 1 e toolResultText escolhe o texto certo', () => {
    expect(pickResultText({ options: ['Ana', 'Bia'], picked: 'Bia' })).toBe('🎯 Sorteado: Bia (entre 2 opções)')
    expect(toolResultText({ tool: 'pick', result: { options: ['Ana', 'Bia'], picked: 'Ana' } })).toBe('🎯 Sorteado: Ana (entre 2 opções)')
    expect(toolResultText({ tool: 'dice', result: { sides: 6, rolls: [4], total: 4 } })).toBe('🎲 d6: 4')
    expect(toolResultText({ tool: 'teams', result: { lanes: false, teams: [{ members: [{ name: 'Ana' }] }] } })).toBe('Times sorteados\nTime 1: Ana')
  })
})
