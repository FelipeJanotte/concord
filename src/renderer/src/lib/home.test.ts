// Funções puras da Home e das conversas (B7): selo, não lidos da comunidade, rótulo do chat.
import { describe, expect, it } from 'vitest'
import type { Channel, DmEntry, FriendEntry } from '@shared/types'
import { chatLabel, DM_PERMISSIONS, findDm } from './dms'
import { communityUnread, homeBadge } from './home'

const account = { id: 'ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const dm: DmEntry = { channel: { id: 'dm1', name: 'dm', type: 'dm', createdAt: 0 }, other: account }
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const entry = (status: FriendEntry['status']): FriendEntry => ({ account, status, since: 0, online: false })

describe('homeBadge', () => {
  it('soma pedidos recebidos e conversas não lidas (pedidos enviados não contam)', () => {
    expect(homeBadge([entry('incoming'), entry('outgoing'), entry('friend')], [dm], { dm1: true, geral: true })).toBe(2)
    expect(homeBadge([], [dm], {})).toBe(0)
  })
})

describe('communityUnread', () => {
  it('só olha os canais da comunidade', () => {
    expect(communityUnread(['geral'], { dm1: true })).toBe(false)
    expect(communityUnread(['geral'], { geral: true })).toBe(true)
  })
})

describe('conversas', () => {
  it('findDm e chatLabel: #canal ou @pessoa', () => {
    expect(findDm([dm], 'dm1')).toBe(dm)
    expect(findDm([dm], 'geral')).toBeUndefined()
    expect(chatLabel(geral, [dm])).toBe('#geral')
    expect(chatLabel(dm.channel, [dm])).toBe('@Ana')
  })

  it('na conversa privada só valem ver, mandar e anexar', () => {
    expect([...DM_PERMISSIONS].sort()).toEqual(['attach', 'send', 'view'])
  })
})
