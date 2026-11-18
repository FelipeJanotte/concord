import { describe, expect, it } from 'vitest'
import {
  accessFor,
  can,
  canAssignRole,
  canChangeMemberRoles,
  canGrantPermissions,
  canManageRole,
  channelPermissions,
  displayColor,
  CHANNEL_PERMISSIONS,
  DEFAULT_EVERYONE_PERMISSIONS,
  EVERYONE_ROLE_ID,
  GLOBAL_PERMISSIONS,
  globalPermissions,
  hasFullAccess,
  highestPosition,
  PERMISSION_LABELS,
  reorderableRoles,
  reorderedPositions,
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

describe('alterar cargos dos membros', () => {
  const people = (): AccessState =>
    access({
      roles: [
        everyone(),
        role('alto', 4),
        role('gerente', 3, ['assignRoles']),
        role('mod', 2, ['manageMembers']),
        role('vip', 1),
        role('enfeite', 5)
      ],
      members: [
        { accountId: 'gil', roleIds: ['gerente'] },
        { accountId: 'igor', roleIds: ['gerente'] },
        { accountId: 'julia', roleIds: ['alto'] },
        { accountId: 'mara', roleIds: ['mod'] },
        { accountId: 'hugo', roleIds: ['vip'] },
        { accountId: 'kel', roleIds: ['enfeite'] }
      ]
    })
  const roleOf = (id: string) => people().roles.find((r) => r.id === id)!

  it('assignRoles ou manageMembers: qualquer alvo, abaixo, no mesmo nível ou acima', () => {
    expect(canChangeMemberRoles(people(), 'gil', 'hugo')).toBe(true)
    expect(canChangeMemberRoles(people(), 'gil', 'zé')).toBe(true)
    expect(canChangeMemberRoles(people(), 'gil', 'mara')).toBe(true)
    expect(canChangeMemberRoles(people(), 'mara', 'hugo')).toBe(true)
    expect(canChangeMemberRoles(people(), 'gil', 'igor')).toBe(true)
    expect(canChangeMemberRoles(people(), 'gil', 'julia')).toBe(true)
    expect(canChangeMemberRoles(people(), 'mara', 'kel')).toBe(true)
  })

  it('não mexe na dona nem em si mesmo', () => {
    expect(canChangeMemberRoles(people(), 'gil', 'dona')).toBe(false)
    expect(canChangeMemberRoles(people(), 'gil', 'gil')).toBe(false)
  })

  it('sem a permissão não mexe em ninguém, mesmo com cargo mais alto', () => {
    expect(canChangeMemberRoles(people(), 'kel', 'hugo')).toBe(false)
  })

  it('a dona mexe em todo mundo, inclusive em si', () => {
    expect(canChangeMemberRoles(people(), 'dona', 'julia')).toBe(true)
    expect(canChangeMemberRoles(people(), 'dona', 'dona')).toBe(true)
  })

  it('só dá ou tira cargo abaixo do seu cargo mais alto; @todos nunca', () => {
    expect(canAssignRole(people(), 'gil', roleOf('vip'))).toBe(true)
    expect(canAssignRole(people(), 'gil', roleOf('mod'))).toBe(true)
    expect(canAssignRole(people(), 'gil', roleOf('gerente'))).toBe(false)
    expect(canAssignRole(people(), 'gil', roleOf('alto'))).toBe(false)
    expect(canAssignRole(people(), 'kel', roleOf('vip'))).toBe(false)
    expect(canAssignRole(people(), 'dona', roleOf('enfeite'))).toBe(true)
    expect(canAssignRole(people(), 'dona', roleOf(EVERYONE_ROLE_ID))).toBe(false)
  })

  it('assignRoles tem texto que diz o limite', () => {
    expect(GLOBAL_PERMISSIONS).toContain('assignRoles')
    expect(PERMISSION_LABELS.assignRoles).toBe('Alterar cargos dos membros (só cargos abaixo do seu)')
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

describe('gerenciar e reordenar cargos', () => {
  const ladder = (): AccessState =>
    access({
      roles: [
        everyone(),
        role('topo', 9),
        role('gerente', 7, ['manageRoles']),
        role('meio', 5),
        role('baixo', 3),
        role('fundo', 1)
      ],
      members: [
        { accountId: 'gil', roleIds: ['gerente'] },
        { accountId: 'zeca', roleIds: ['meio'] }
      ]
    })
  const roleIn = (a: AccessState, id: string) => a.roles.find((r) => r.id === id)!

  it('canManageRole: dona tudo; com manageRoles só abaixo do seu; @todos com qualquer cargo', () => {
    const a = ladder()
    expect(canManageRole(a, 'dona', roleIn(a, 'topo'))).toBe(true)
    expect(canManageRole(a, 'gil', roleIn(a, 'topo'))).toBe(false)
    expect(canManageRole(a, 'gil', roleIn(a, 'gerente'))).toBe(false)
    expect(canManageRole(a, 'gil', roleIn(a, 'meio'))).toBe(true)
    expect(canManageRole(a, 'gil', roleIn(a, EVERYONE_ROLE_ID))).toBe(true)
    expect(canManageRole(a, 'zeca', roleIn(a, 'fundo'))).toBe(false)
  })

  it('reorderableRoles: só os cargos abaixo do seu, do menos para o mais importante, sem @todos', () => {
    expect(reorderableRoles(ladder(), 'gil').map((r) => r.id)).toEqual(['fundo', 'baixo', 'meio'])
    expect(reorderableRoles(ladder(), 'dona').map((r) => r.id)).toEqual(['fundo', 'baixo', 'meio', 'gerente', 'topo'])
    expect(reorderableRoles(ladder(), 'zeca')).toEqual([])
  })

  it('reorderedPositions: troca quem fica em cada posição abaixo do seu', () => {
    expect(reorderedPositions(ladder(), 'gil', ['meio', 'fundo', 'baixo'])).toEqual(
      new Map([
        ['meio', 1],
        ['fundo', 3],
        ['baixo', 5]
      ])
    )
  })

  it('reorderedPositions: recusa mover o seu cargo, os de cima, @todos e lista incompleta ou repetida', () => {
    const a = ladder()
    expect(reorderedPositions(a, 'gil', ['fundo', 'baixo', 'gerente'])).toBeNull()
    expect(reorderedPositions(a, 'gil', ['fundo', 'baixo', 'meio', 'topo'])).toBeNull()
    expect(reorderedPositions(a, 'gil', [EVERYONE_ROLE_ID, 'fundo', 'baixo', 'meio'])).toBeNull()
    expect(reorderedPositions(a, 'gil', ['fundo', 'baixo'])).toBeNull()
    expect(reorderedPositions(a, 'gil', ['fundo', 'fundo', 'meio'])).toBeNull()
    expect(reorderedPositions(a, 'gil', 'fundo')).toBeNull()
    expect(reorderedPositions(a, 'zeca', [])).toBeNull()
  })

  it('reorderedPositions: a dona move qualquer cargo para qualquer posição (menos @todos)', () => {
    expect(reorderedPositions(ladder(), 'dona', ['topo', 'fundo', 'baixo', 'meio', 'gerente'])?.get('topo')).toBe(1)
  })
})

describe('Administrador', () => {
  const crew = (): AccessState =>
    access({
      roles: [
        everyone(['view', 'send']),
        role('chefe', 6, ['manageRoles']),
        role('alto', 5, ['manageMembers']),
        role('poder', 4, ['administrator']),
        role('gerente', 3, ['manageRoles', 'assignRoles', 'manageMembers']),
        role('admin-baixo', 2, ['administrator']),
        role('vip', 1)
      ],
      members: [
        { accountId: 'adm', roleIds: ['poder'] },
        { accountId: 'adm2', roleIds: ['admin-baixo'] },
        { accountId: 'chefe', roleIds: ['chefe'] },
        { accountId: 'alto', roleIds: ['alto'] },
        { accountId: 'gil', roleIds: ['gerente'] },
        { accountId: 'hugo', roleIds: ['vip'] }
      ],
      overrides: [override('segredo', EVERYONE_ROLE_ID, [], ['view']), override('segredo', 'poder', [], ['view', 'send'])]
    })
  const roleIn = (id: string) => crew().roles.find((r) => r.id === id)!

  it('passa em toda permissão global e de canal, inclusive com regra de canal que negaria', () => {
    expect(sorted(globalPermissions(crew(), 'adm'))).toEqual([...GLOBAL_PERMISSIONS].sort())
    expect(sorted(channelPermissions(crew(), 'adm', 'segredo'))).toEqual([...CHANNEL_PERMISSIONS].sort())
    expect(can(crew(), 'adm', 'speak', 'segredo')).toBe(true)
    expect(hasFullAccess(crew(), 'adm')).toBe(true)
    expect(hasFullAccess(crew(), 'dona')).toBe(true)
    expect(hasFullAccess(crew(), 'gil')).toBe(false)
  })

  it('ignora a hierarquia: gerencia, reordena e dá qualquer cargo, inclusive acima do seu', () => {
    expect(canManageRole(crew(), 'adm', roleIn('chefe'))).toBe(true)
    expect(reorderableRoles(crew(), 'adm').map((r) => r.id)).toEqual(['vip', 'admin-baixo', 'gerente', 'poder', 'alto', 'chefe'])
    expect(canAssignRole(crew(), 'adm', roleIn('chefe'))).toBe(true)
    expect(canAssignRole(crew(), 'adm', roleIn(EVERYONE_ROLE_ID))).toBe(false)
    expect(canChangeMemberRoles(crew(), 'adm', 'chefe')).toBe(true)
  })

  it('não mexe na dona nem nos próprios cargos', () => {
    expect(canChangeMemberRoles(crew(), 'adm', 'dona')).toBe(false)
    expect(canChangeMemberRoles(crew(), 'adm', 'adm')).toBe(false)
  })

  it('só a dona ou um admin concede, dá ou mexe num cargo com Administrador', () => {
    expect(canGrantPermissions(crew(), 'adm', 'vip', ['administrator'])).toBe(true)
    expect(canGrantPermissions(crew(), 'chefe', 'vip', ['administrator'])).toBe(false)
    expect(canAssignRole(crew(), 'gil', roleIn('admin-baixo'))).toBe(false)
    expect(canAssignRole(crew(), 'gil', roleIn('vip'))).toBe(true)
    expect(canAssignRole(crew(), 'adm', roleIn('admin-baixo'))).toBe(true)
    expect(canManageRole(crew(), 'gil', roleIn('admin-baixo'))).toBe(false)
    expect(reorderableRoles(crew(), 'gil').map((r) => r.id)).toEqual(['vip'])
  })

  it('Administrador no @todos só a dona dá', () => {
    expect(canGrantPermissions(crew(), 'adm', EVERYONE_ROLE_ID, ['administrator'])).toBe(false)
    expect(canGrantPermissions(crew(), 'dona', EVERYONE_ROLE_ID, ['administrator'])).toBe(true)
  })

  it('tem rótulo que avisa do acesso total', () => {
    expect(GLOBAL_PERMISSIONS[0]).toBe('administrator')
    expect(PERMISSION_LABELS.administrator).toMatch(/^Administrador/)
    expect(PERMISSION_LABELS.administrator).toMatch(/acesso total/)
  })
})
