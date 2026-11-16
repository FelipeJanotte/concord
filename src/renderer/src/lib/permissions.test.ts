// Helpers de permissão da tela (B5): devem dar o mesmo resultado que o servidor.
import { describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, type AccessState, type Role } from '@shared/types'
import {
  allows,
  canManageRole,
  isPrivateChannel,
  memberRoleIds,
  rolesByPosition,
  topRole
} from './permissions'

const everyone: Role = { id: EVERYONE_ROLE_ID, name: '@todos', color: null, position: 0, permissions: ['view', 'send', 'attach'] }
const admin: Role = { id: 'admin', name: 'Admin', color: '#ff0000', position: 3, permissions: ['manageRoles', 'manageMembers'] }
const mod: Role = { id: 'mod', name: 'Mod', color: null, position: 2, permissions: ['manageMembers'] }
const vip: Role = { id: 'vip', name: 'VIP', color: '#00ff00', position: 1, permissions: [] }

const access: AccessState = {
  ownerAccountId: 'dona',
  roles: [vip, everyone, admin, mod],
  members: [
    { accountId: 'ana', roleIds: ['admin', 'vip'] },
    { accountId: 'bia', roleIds: ['mod'] },
    { accountId: 'caio', roleIds: ['vip'] }
  ],
  overrides: [
    { channelId: 'segredo', roleId: EVERYONE_ROLE_ID, allow: [], deny: ['view'] },
    { channelId: 'segredo', roleId: 'vip', allow: ['view'], deny: [] },
    { channelId: 'avisos', roleId: EVERYONE_ROLE_ID, allow: [], deny: ['send'] }
  ]
}

describe('allows', () => {
  it('sem estado de acesso (antes do hello) não esconde nada', () => {
    expect(allows(null, 'ana', 'manageChannels')).toBe(true)
    expect(allows(access, undefined, 'manageChannels')).toBe(true)
  })

  it('usa a mesma regra do servidor', () => {
    expect(allows(access, 'caio', 'manageChannels')).toBe(false)
    expect(allows(access, 'dona', 'manageChannels')).toBe(true)
    expect(allows(access, 'caio', 'send', 'avisos')).toBe(false)
    expect(allows(access, 'caio', 'view', 'segredo')).toBe(true)
    expect(allows(access, 'bia', 'view', 'segredo')).toBe(false)
  })
})

describe('canal privado e cargos', () => {
  it('privado = @todos com view negado', () => {
    expect(isPrivateChannel(access, 'segredo')).toBe(true)
    expect(isPrivateChannel(access, 'avisos')).toBe(false)
    expect(isPrivateChannel(null, 'segredo')).toBe(false)
  })

  it('ordena do mais para o menos importante, @todos por último', () => {
    expect(rolesByPosition(access).map((r) => r.id)).toEqual(['admin', 'mod', 'vip', EVERYONE_ROLE_ID])
  })

  it('cargo mais alto e cargos da pessoa', () => {
    expect(topRole(access, 'ana')?.id).toBe('admin')
    expect(topRole(access, 'dona')).toBeNull()
    expect(memberRoleIds(access, 'bia')).toEqual(['mod'])
    expect(memberRoleIds(access, 'ninguem')).toEqual([])
  })
})

describe('hierarquia', () => {
  it('canManageRole: dona tudo; com manageRoles só abaixo do seu; @todos com qualquer cargo', () => {
    expect(canManageRole(access, 'dona', admin)).toBe(true)
    expect(canManageRole(access, 'ana', admin)).toBe(false)
    expect(canManageRole(access, 'ana', mod)).toBe(true)
    expect(canManageRole(access, 'ana', everyone)).toBe(true)
    expect(canManageRole(access, 'bia', vip)).toBe(false) // sem manageRoles
  })
})
