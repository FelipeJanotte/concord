// Abas da tela "Amigos": agrupamento e ordem.
import { describe, expect, it } from 'vitest'
import type { FriendEntry } from '@shared/types'
import { friendGroups, incomingCount } from './friends'

const e = (name: string, status: FriendEntry['status'], online = false): FriendEntry => ({
  account: { id: name, name, tag: `${name.toLowerCase()}1`, color: '#000', avatarUrl: null },
  status,
  since: 1,
  online
})

describe('friendGroups', () => {
  const list = [e('caio', 'friend', true), e('Ana', 'friend'), e('Bia', 'friend', true), e('Duda', 'outgoing'), e('Edu', 'incoming'), e('Fê', 'blocked')]

  it('separa as abas, em ordem alfabética sem diferenciar maiúsculas', () => {
    const g = friendGroups(list)
    expect(g.all.map((x) => x.account.name)).toEqual(['Ana', 'Bia', 'caio'])
    expect(g.online.map((x) => x.account.name)).toEqual(['Bia', 'caio'])
    expect(g.pending.map((x) => x.account.name)).toEqual(['Edu', 'Duda']) // recebidos primeiro
    expect(g.blocked.map((x) => x.account.name)).toEqual(['Fê'])
  })

  it('não muda a lista original; vazia dá abas vazias', () => {
    const copy = [...list]
    friendGroups(list)
    expect(list).toEqual(copy)
    expect(friendGroups([])).toEqual({ online: [], all: [], pending: [], blocked: [] })
  })

  it('incomingCount conta só pedidos recebidos', () => {
    expect(incomingCount(list)).toBe(1)
  })
})
