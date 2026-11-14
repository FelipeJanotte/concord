import { describe, expect, it } from 'vitest'
import { parseFriendTarget } from './friends'

describe('parseFriendTarget', () => {
  it.each([
    ['Ana#1234', { name: 'Ana', tag: '1234' }],
    ['  Ana Souza  #ab12 ', { name: 'Ana Souza', tag: 'ab12' }],
    ['nome#com#cerquilha#x1', { name: 'nome#com#cerquilha', tag: 'x1' }]
  ])('%s', (raw, expected) => {
    expect(parseFriendTarget(raw)).toEqual(expected)
  })

  it.each(['Ana', '#1234', 'Ana#', 'Ana#123456', 'Ana#1-2', '', 42, null])('recusa %o', (raw) => {
    expect(parseFriendTarget(raw)).toBeNull()
  })
})
