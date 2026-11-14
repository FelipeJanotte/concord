import { describe, expect, it } from 'vitest'
import {
  accessFor,
  can,
  canGrantPermissions,
  channelPermissions,
  displayColor,
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
  it('existe a permissão de moderar mensagens (B6)', () => {
    expect(GLOBAL_PERMISSIONS).toContain('manageMessages')
  })

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

describe('conceder permissões (contra escalada de privilégio)', () => {
  it('a dona concede qualquer coisa, inclusive ao @todos', () => {
    expect(canGrantPermissions(access(), 'dona', EVERYONE_ROLE_ID, ['manageRoles', 'manageChannels'])).toBe(true)
  })

  it('ninguém concede permissão global que não tem', () => {
    // caio tem manageMembers (mod), mas não manageChannels
    expect(canGrantPermissions(access(), 'caio', 'vip', ['manageMembers'])).toBe(true)
    expect(canGrantPermissions(access(), 'caio', 'vip', ['manageChannels'])).toBe(false)
  })

  it('permissão de canal pode; global no @todos só a dona', () => {
    expect(canGrantPermissions(access(), 'ana', EVERYONE_ROLE_ID, ['view', 'send'])).toBe(true)
    expect(canGrantPermissions(access(), 'ana', EVERYONE_ROLE_ID, ['manageRoles'])).toBe(false)
  })
})

describe('displayColor', () => {
  it('cor do cargo mais alto que tem cor; sem cor nenhuma, null', () => {
    const a = access({
      roles: [everyone(), { ...role('azul', 1), color: '#0000ff' }, role('sem-cor', 5), { ...role('verde', 3), color: '#00ff00' }],
      members: [
        { accountId: 'bia', roleIds: ['azul', 'sem-cor', 'verde'] },
        { accountId: 'caio', roleIds: ['sem-cor'] }
      ]
    })
    expect(displayColor(a, 'bia')).toBe('#00ff00')
    expect(displayColor(a, 'caio')).toBeNull()
    expect(displayColor(a, 'zé')).toBeNull()
  })
})

describe('accessFor (o que cada um recebe)', () => {
  const withPrivate = () =>
    access({
      overrides: [
        override('segredo', EVERYONE_ROLE_ID, [], ['view']),
        override('segredo', 'vip', ['view'], []),
        override('anuncios', EVERYONE_ROLE_ID, [], ['send'])
      ]
    })

  it('quem não vê o canal privado não recebe as regras dele (nem sabe que existe)', () => {
    const forZe = accessFor(withPrivate(), 'zé', ['geral', 'segredo', 'anuncios'])
    expect(forZe.overrides.map((o) => o.channelId)).toEqual(['anuncios'])
    expect(forZe.roles).toEqual(withPrivate().roles) // cargos e membros vão inteiros (cores)
  })

  it('quem vê recebe; dona e quem gerencia canais recebem tudo', () => {
    expect(accessFor(withPrivate(), 'bia', ['segredo', 'anuncios']).overrides).toHaveLength(3)
    expect(accessFor(withPrivate(), 'dona', []).overrides).toHaveLength(3)
    expect(accessFor(withPrivate(), 'ana', []).overrides).toHaveLength(3)
  })
})

describe('textos', () => {
  it('toda permissão tem texto em pt-BR', () => {
    for (const p of [...GLOBAL_PERMISSIONS, ...CHANNEL_PERMISSIONS]) expect(PERMISSION_LABELS[p].length).toBeGreaterThan(3)
  })
})
