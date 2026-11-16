import { describe, expect, it } from 'vitest'
import { canModerate, canMoveMember } from './moderation'
import { DEFAULT_EVERYONE_PERMISSIONS, EVERYONE_ROLE_ID, type AccessState, type Role } from './permissions'

const role = (id: string, position: number, permissions: Role['permissions'] = []): Role => ({
  id,
  name: id,
  color: null,
  position,
  permissions
})

function access(): AccessState {
  return {
    ownerAccountId: 'dona',
    roles: [
      role(EVERYONE_ROLE_ID, 0, DEFAULT_EVERYONE_PERMISSIONS),
      role('alto', 4),
      role('mover', 3, ['moveMembers']),
      role('gerente', 2, ['manageMembers']),
      role('baixo', 1)
    ],
    members: [
      { accountId: 'mover', roleIds: ['mover'] },
      { accountId: 'mover2', roleIds: ['mover'] },
      { accountId: 'gerente', roleIds: ['gerente'] },
      { accountId: 'baixo', roleIds: ['baixo'] },
      { accountId: 'alto', roleIds: ['alto'] }
    ],
    overrides: []
  }
}

describe('canMoveMember', () => {
  it('moveMembers move quem está abaixo, sem ganhar o resto da moderação', () => {
    expect(canMoveMember(access(), 'mover', 'baixo')).toBe(true)
    expect(canMoveMember(access(), 'mover', 'gerente')).toBe(true)
    expect(canMoveMember(access(), 'mover', 'semCargo')).toBe(true)
    expect(canModerate(access(), 'mover', 'baixo')).toBe(false)
  })

  it('manageMembers continua movendo quem está abaixo', () => {
    expect(canMoveMember(access(), 'gerente', 'baixo')).toBe(true)
  })

  it('não move a si mesmo, a dona, cargo igual ou acima', () => {
    expect(canMoveMember(access(), 'mover', 'mover')).toBe(false)
    expect(canMoveMember(access(), 'mover', 'dona')).toBe(false)
    expect(canMoveMember(access(), 'mover', 'mover2')).toBe(false)
    expect(canMoveMember(access(), 'mover', 'alto')).toBe(false)
    expect(canMoveMember(access(), 'gerente', 'mover')).toBe(false)
  })

  it('sem moveMembers nem manageMembers não move ninguém', () => {
    expect(canMoveMember(access(), 'alto', 'baixo')).toBe(false)
    expect(canMoveMember(access(), 'semCargo', 'baixo')).toBe(false)
  })

  it('a dona move todo mundo menos ela mesma', () => {
    expect(canMoveMember(access(), 'dona', 'alto')).toBe(true)
    expect(canMoveMember(access(), 'dona', 'dona')).toBe(false)
  })
})
