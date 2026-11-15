// Avisos do fim da chamada (B8): cada motivo, visto de cada lado.
import { describe, expect, it } from 'vitest'
import { callEndText, type CallEndReason } from './calls'

const ended = (reason: CallEndReason) => ({ channelId: 'dm', callerId: 'a', calleeId: 'b', reason })

describe('callEndText', () => {
  it('quem ligou', () => {
    expect(callEndText(ended('declined'), 'a', 'Bia', false)).toBe('Bia recusou a chamada.')
    expect(callEndText(ended('missed'), 'a', 'Bia', false)).toBe('Bia não atendeu.')
    expect(callEndText(ended('cancelled'), 'a', 'Bia', false)).toBeNull()
    expect(callEndText(ended('ended'), 'a', 'Bia', false)).toBe('Chamada encerrada.')
  })

  it('quem recebeu', () => {
    expect(callEndText(ended('declined'), 'b', 'Ana', false)).toBeNull()
    expect(callEndText(ended('missed'), 'b', 'Ana', false)).toBe('Chamada perdida de Ana.')
    expect(callEndText(ended('cancelled'), 'b', 'Ana', false)).toBe('Chamada perdida de Ana.')
    expect(callEndText(ended('blocked'), 'b', 'Ana', false)).toBe('Chamada encerrada.')
  })

  it('quem encerrou não recebe aviso', () => {
    expect(callEndText(ended('ended'), 'a', 'Bia', true)).toBeNull()
  })
})
