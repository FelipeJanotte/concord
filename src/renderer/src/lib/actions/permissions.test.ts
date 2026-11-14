// Ações de cargos e permissões (B5): estado de acesso na store e o que é enviado ao servidor.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, type AccessState, type Role } from '@shared/types'
import {
  bindPermissionsEvents,
  createRole,
  deleteRole,
  reloadAccess,
  reorderRoles,
  setChannelOverrides,
  setMemberRoles,
  updateRole
} from '@/lib/actions/permissions'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const everyone: Role = { id: EVERYONE_ROLE_ID, name: '@todos', color: null, position: 0, permissions: ['view', 'send'] }
const mod: Role = { id: 'mod', name: 'Mod', color: '#ff0000', position: 1, permissions: ['manageMembers'] }
const access: AccessState = { ownerAccountId: 'acc-dona', roles: [everyone, mod], members: [], overrides: [] }

let socket: FakeSocket

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  bindPermissionsEvents(socket.asSocket())
  useApp.setState({ ...initialState })
})

afterEach(() => setSocket(null))

describe('estado de acesso', () => {
  it('começa vazio (null = não esconde nada)', () => {
    expect(useApp.getState().access).toBeNull()
  })

  it('access:updated troca o estado inteiro', () => {
    socket.receive('access:updated', access)
    expect(useApp.getState().access).toEqual(access)
  })

  it('reloadAccess pede access:get e guarda a resposta', async () => {
    socket.replyTo('access:get', () => access)
    await expect(reloadAccess()).resolves.toEqual(access)
    expect(useApp.getState().access).toEqual(access)
  })
})

describe('cargos', () => {
  it('createRole manda nome sem espaços nas pontas e devolve o cargo criado', async () => {
    socket.replyTo('role:create', () => ({ ok: true, role: mod }))
    await expect(createRole('  Mod  ', '#ff0000', ['manageMembers'])).resolves.toEqual(mod)
    expect(socket.sent('role:create')[0][0]).toEqual({ name: 'Mod', color: '#ff0000', permissions: ['manageMembers'] })
  })

  it('erro do servidor vira exceção com a mensagem dele', async () => {
    socket.replyTo('role:create', () => ({ ok: false, error: 'Você não pode dar permissões que não tem' }))
    await expect(createRole('X', null, ['manageRoles'])).rejects.toThrow('Você não pode dar permissões que não tem')
  })

  it('updateRole manda só o que mudou (o @todos só com permissões)', async () => {
    socket.replyTo('role:update', () => ({ ok: true, role: everyone }))
    await updateRole(EVERYONE_ROLE_ID, { permissions: ['view'] })
    expect(socket.sent('role:update')[0][0]).toEqual({ id: EVERYONE_ROLE_ID, permissions: ['view'] })
    await updateRole('mod', { name: ' Moderação ', color: null })
    expect(socket.sent('role:update')[1][0]).toEqual({ id: 'mod', name: 'Moderação', color: null })
  })

  it('deleteRole e reorderRoles repassam o erro', async () => {
    socket.replyTo('role:delete', () => ({ ok: true }))
    await deleteRole('mod')
    expect(socket.sent('role:delete')[0][0]).toBe('mod')
    socket.replyTo('role:reorder', () => ({ ok: false, error: 'Lista de cargos inválida' }))
    await expect(reorderRoles(['a', 'b'])).rejects.toThrow('Lista de cargos inválida')
    expect(socket.sent('role:reorder')[0][0]).toEqual(['a', 'b'])
  })
})

describe('membros e canais', () => {
  it('setMemberRoles substitui os cargos da conta', async () => {
    socket.replyTo('member:set-roles', () => ({ ok: true }))
    await setMemberRoles('acc-ana', ['mod'])
    expect(socket.sent('member:set-roles')[0][0]).toEqual({ accountId: 'acc-ana', roleIds: ['mod'] })
  })

  it('setChannelOverrides não manda regra vazia', async () => {
    socket.replyTo('channel:set-overrides', () => ({ ok: true }))
    await setChannelOverrides('segredo', [
      { roleId: EVERYONE_ROLE_ID, allow: [], deny: ['view'] },
      { roleId: 'mod', allow: [], deny: [] },
      { roleId: 'vip', allow: ['view'], deny: [] }
    ])
    expect(socket.sent('channel:set-overrides')[0][0]).toEqual({
      channelId: 'segredo',
      overrides: [
        { roleId: EVERYONE_ROLE_ID, allow: [], deny: ['view'] },
        { roleId: 'vip', allow: ['view'], deny: [] }
      ]
    })
  })
})
