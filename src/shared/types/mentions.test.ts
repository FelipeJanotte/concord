// Contrato das menções (B19): achar as menções no texto, "me menciona?" e o texto comum.
import { describe, expect, it } from 'vitest'
import { mentionsAccount, mentionsToPlain, mentionToken, parseMentions } from './mentions'

const ana = '11111111-1111-1111-1111-111111111111'
const bia = '22222222-2222-2222-2222-222222222222'

describe('parseMentions', () => {
  it('contas sem repetir (maiúsculas viram minúsculas), @todos e o limite de 20', () => {
    expect(parseMentions(`oi ${mentionToken(ana)} e <@${bia.toUpperCase()}> e ${mentionToken(ana)}`)).toEqual({ accountIds: [ana, bia], everyone: false })
    expect(parseMentions('atenção <@todos>!')).toEqual({ accountIds: [], everyone: true })
    expect(parseMentions('<@nao-e-uuid> @Ana <@>')).toEqual({ accountIds: [], everyone: false })
    const many = Array.from({ length: 25 }, (_, i) => `<@00000000-0000-0000-0000-${String(i).padStart(12, '0')}>`).join(' ')
    expect(parseMentions(many).accountIds).toHaveLength(20)
  })
})

describe('mentionsAccount', () => {
  it('pela conta ou por @todos; sem conta, nunca', () => {
    expect(mentionsAccount(`ei ${mentionToken(ana)}`, ana)).toBe(true)
    expect(mentionsAccount(`ei ${mentionToken(ana)}`, bia)).toBe(false)
    expect(mentionsAccount('<@todos> reunião', bia)).toBe(true)
    expect(mentionsAccount('<@todos>', undefined)).toBe(false)
  })
})

describe('mentionsToPlain', () => {
  it('troca os tokens por @Nome; nome desconhecido vira @alguém', () => {
    const names: Record<string, string> = { [ana]: 'Ana' }
    expect(mentionsToPlain(`oi ${mentionToken(ana)}, ${mentionToken(bia)} e <@todos>`, (id) => names[id])).toBe('oi @Ana, @alguém e @todos')
  })
})
