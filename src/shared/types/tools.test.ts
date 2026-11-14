// Texto por extenso do resultado do sorteador (vai no content da mensagem).
import { describe, expect, it } from 'vitest'
import { MESSAGE_MAX_LENGTH } from './message'
import { teamsResultText } from './tools'

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
