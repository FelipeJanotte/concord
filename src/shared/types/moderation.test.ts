import { describe, expect, it } from 'vitest'
import { canBanMember, canKickMember, canModerate, canMoveMember, canTimeoutMember, timeoutMessage } from './moderation'
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

describe('Administrador na moderação', () => {
  const withAdmins = (): AccessState => {
    const a = access()
    a.roles.push(role('adm', 1, ['administrator']))
    a.members.push({ accountId: 'adm', roleIds: ['adm'] }, { accountId: 'adm2', roleIds: ['adm'] })
    return a
  }

  it('modera e move qualquer membro, inclusive acima do seu cargo e outro admin', () => {
    expect(canModerate(withAdmins(), 'adm', 'alto')).toBe(true)
    expect(canModerate(withAdmins(), 'adm', 'adm2')).toBe(true)
    expect(canMoveMember(withAdmins(), 'adm', 'alto')).toBe(true)
  })

  it('não modera a dona nem a si mesmo', () => {
    expect(canModerate(withAdmins(), 'adm', 'dona')).toBe(false)
    expect(canModerate(withAdmins(), 'adm', 'adm')).toBe(false)
    expect(canMoveMember(withAdmins(), 'adm', 'dona')).toBe(false)
  })
})

describe('expulsar, banir e castigar da comunidade', () => {
  const crew = (): AccessState => {
    const a = access()
    a.roles.push(role('expulsa', 3, ['kickMembers']), role('bane', 3, ['banMembers']), role('castiga', 3, ['timeoutMembers']))
    a.members.push(
      { accountId: 'expulsa', roleIds: ['expulsa'] },
      { accountId: 'bane', roleIds: ['bane'] },
      { accountId: 'castiga', roleIds: ['castiga'] }
    )
    return a
  }

  it('cada permissão vale só para a sua ação, sobre quem está abaixo', () => {
    expect(canKickMember(crew(), 'expulsa', 'baixo')).toBe(true)
    expect(canBanMember(crew(), 'expulsa', 'baixo')).toBe(false)
    expect(canBanMember(crew(), 'bane', 'baixo')).toBe(true)
    expect(canTimeoutMember(crew(), 'bane', 'baixo')).toBe(false)
    expect(canTimeoutMember(crew(), 'castiga', 'baixo')).toBe(true)
    expect(canKickMember(crew(), 'castiga', 'baixo')).toBe(false)
  })

  it('não age sobre a dona, a si mesmo, cargo igual ou acima', () => {
    for (const check of [canKickMember, canBanMember, canTimeoutMember]) {
      expect(check(crew(), 'dona', 'baixo')).toBe(true)
      expect(check(crew(), 'dona', 'dona')).toBe(false)
      expect(check(crew(), 'gerente', 'baixo')).toBe(false)
    }
    expect(canBanMember(crew(), 'bane', 'dona')).toBe(false)
    expect(canBanMember(crew(), 'bane', 'bane')).toBe(false)
    expect(canBanMember(crew(), 'bane', 'expulsa')).toBe(false)
    expect(canBanMember(crew(), 'bane', 'alto')).toBe(false)
  })
})

describe('timeoutMessage', () => {
  const at = (iso: string): number => new Date(iso).getTime()

  it('no mesmo dia mostra só a hora', () => {
    expect(timeoutMessage(at('2026-11-18T14:30:00Z'), at('2026-11-18T10:00:00Z'), 'UTC')).toBe('Você está de castigo até 14:30')
  })

  it('em outro dia mostra a data junto', () => {
    expect(timeoutMessage(at('2026-11-25T09:05:00Z'), at('2026-11-18T10:00:00Z'), 'UTC')).toBe('Você está de castigo até 25/11 09:05')
  })

  it('usa o fuso pedido', () => {
    expect(timeoutMessage(at('2026-11-18T14:30:00Z'), at('2026-11-18T13:00:00Z'), 'America/Sao_Paulo')).toBe('Você está de castigo até 11:30')
  })
})
