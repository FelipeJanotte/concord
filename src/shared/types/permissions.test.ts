import { describe, expect, it } from 'vitest'
import {
  can,
  channelPermissions,
  CHANNEL_PERMISSIONS,
  DEFAULT_EVERYONE_PERMISSIONS,
  EVERYONE_ROLE_ID,
  GLOBAL_PERMISSIONS,
  globalPermissions,
  highestPosition,
  PERMISSION_LABELS,
  type AccessState,
  type ChannelOverride,
  type Role
} from './permissions'

const everyone = (permissions = DEFAULT_EVERYONE_PERMISSIONS): Role => ({
  id: EVERYONE_ROLE_ID,
  name: '@todos',
  color: null,
  position: 0,
  permissions
})

const role = (id: string, position: number, permissions: Role['permissions'] = []): Role => ({
  id,
  name: id,
  color: null,
  position,
  permissions
})

function access(over: Partial<AccessState> = {}): AccessState {
  return {
    ownerAccountId: 'dona',
    roles: [everyone(), role('admin', 3, ['manageChannels', 'manageRoles', 'manageMembers']), role('vip', 2), role('mod', 1, ['manageMembers'])],
    members: [
      { accountId: 'ana', roleIds: ['admin'] },
      { accountId: 'bia', roleIds: ['vip'] },
      { accountId: 'caio', roleIds: ['mod', 'vip'] }
    ],
    overrides: [],
    ...over
  }
}

const override = (channelId: string, roleId: string, allow: ChannelOverride['allow'], deny: ChannelOverride['deny']) => ({
  channelId,
  roleId,
  allow,
  deny
})

const sorted = (s: Set<string>) => [...s].sort()

describe('globais', () => {
  it('a dona tem todas; quem não tem cargo não tem nenhuma', () => {
    expect(sorted(globalPermissions(access(), 'dona'))).toEqual([...GLOBAL_PERMISSIONS].sort())
    expect(globalPermissions(access(), 'zé')).toEqual(new Set())
  })

  it('soma os cargos da pessoa', () => {
    expect(sorted(globalPermissions(access(), 'caio'))).toEqual(['manageMembers'])
    expect(can(access(), 'ana', 'manageRoles')).toBe(true)
    expect(can(access(), 'bia', 'manageRoles')).toBe(false)
  })

  it('cargo atribuído que não existe mais é ignorado', () => {
    const a = access({ members: [{ accountId: 'zé', roleIds: ['apagado'] }] })
    expect(globalPermissions(a, 'zé')).toEqual(new Set())
  })
})

describe('por canal', () => {
  it('sem regras: o que o @todos tem', () => {
    expect(sorted(channelPermissions(access(), 'zé', 'geral'))).toEqual([...CHANNEL_PERMISSIONS].sort())
  })

  it('canal privado: @todos nega ver, um cargo libera', () => {
    const a = access({ overrides: [override('vip-room', EVERYONE_ROLE_ID, [], ['view']), override('vip-room', 'vip', ['view'], [])] })
    expect(can(a, 'zé', 'view', 'vip-room')).toBe(false)
    expect(channelPermissions(a, 'zé', 'vip-room')).toEqual(new Set()) // sem ver, nada
    expect(can(a, 'bia', 'view', 'vip-room')).toBe(true)
    expect(can(a, 'bia', 'send', 'vip-room')).toBe(true)
    expect(can(a, 'zé', 'view', 'geral')).toBe(true) // outros canais não mudam
  })

  it('entre cargos, liberar vence negar', () => {
    const a = access({ overrides: [override('c', 'mod', [], ['send']), override('c', 'vip', ['send'], [])] })
    expect(can(a, 'caio', 'send', 'c')).toBe(true)
  })

  it('regra do cargo vence a regra do @todos', () => {
    const a = access({ overrides: [override('anuncios', EVERYONE_ROLE_ID, [], ['send']), override('anuncios', 'mod', ['send'], [])] })
    expect(can(a, 'zé', 'send', 'anuncios')).toBe(false)
    expect(can(a, 'zé', 'view', 'anuncios')).toBe(true)
    expect(can(a, 'caio', 'send', 'anuncios')).toBe(true)
  })

  it('dependências: sem enviar não anexa; sem entrar não fala nem compartilha', () => {
    const a = access({ overrides: [override('c', EVERYONE_ROLE_ID, [], ['send', 'connect'])] })
    expect(sorted(channelPermissions(a, 'zé', 'c'))).toEqual(['view'])
  })

  it('quem gerencia canais sempre vê (não se tranca para fora), mas segue as outras regras', () => {
    const a = access({ overrides: [override('c', EVERYONE_ROLE_ID, [], ['view', 'send'])] })
    expect(can(a, 'ana', 'view', 'c')).toBe(true)
    expect(can(a, 'ana', 'send', 'c')).toBe(false)
  })

  it('a dona pode tudo em qualquer canal', () => {
    const a = access({ overrides: [override('c', EVERYONE_ROLE_ID, [], [...CHANNEL_PERMISSIONS])] })
    expect(sorted(channelPermissions(a, 'dona', 'c'))).toEqual([...CHANNEL_PERMISSIONS].sort())
  })

  it('@todos sem permissão nenhuma e cargo com permissão base', () => {
    const a = access({
      roles: [everyone([]), role('membro', 1, ['view', 'send'])],
      members: [{ accountId: 'bia', roleIds: ['membro'] }]
    })
    expect(channelPermissions(a, 'zé', 'geral')).toEqual(new Set())
    expect(sorted(channelPermissions(a, 'bia', 'geral'))).toEqual(['send', 'view'])
  })

  it('permissão de canal sem channelId é sempre falso', () => {
    expect(can(access(), 'dona', 'view')).toBe(false)
  })
})

describe('hierarquia', () => {
  it('posição do cargo mais alto (dona = infinito, sem cargo = 0)', () => {
    expect(highestPosition(access(), 'dona')).toBe(Number.POSITIVE_INFINITY)
    expect(highestPosition(access(), 'caio')).toBe(2)
    expect(highestPosition(access(), 'zé')).toBe(0)
  })
})

describe('textos', () => {
  it('toda permissão tem texto em pt-BR', () => {
    for (const p of [...GLOBAL_PERMISSIONS, ...CHANNEL_PERMISSIONS]) expect(PERMISSION_LABELS[p].length).toBeGreaterThan(3)
  })
})
