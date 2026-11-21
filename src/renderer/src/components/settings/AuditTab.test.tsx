// @vitest-environment jsdom
import '@/test/ui-sdk-dom'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EVERYONE_ROLE_ID, type AccessState, type AuditEntry, type Permission, type User } from '@shared/types'
import { CommunitySettingsDialog } from '@/components/settings/CommunitySettingsDialog'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const user = (accountId: string, name: string): User => ({
  id: `sock-${accountId}`,
  accountId,
  name,
  tag: accountId,
  color: '#aaaaaa',
  avatarUrl: null
})

const dona = user('dona', 'Dona')
const mod = user('mod', 'Mod')
const ana = user('ana', 'Ana')
const person = (u: User) => ({ accountId: u.accountId, name: u.name, tag: u.tag })

function access(modPermissions: Permission[]): AccessState {
  return {
    ownerAccountId: 'dona',
    roles: [
      { id: EVERYONE_ROLE_ID, name: '@todos', color: null, position: 0, permissions: ['view', 'send'] },
      { id: 'r-mod', name: 'Mod', color: null, position: 1, permissions: modPermissions }
    ],
    members: [{ accountId: 'mod', roleIds: ['r-mod'] }],
    overrides: []
  }
}

const ban = (id: string, by: User = dona): AuditEntry => ({
  id,
  action: 'ban',
  targetId: 'ana',
  details: { reason: null },
  actor: person(by),
  target: person(ana),
  createdAt: new Date(2030, 0, 2, 9, 5).getTime()
})

let socket: FakeSocket

function login(self: User, modPermissions: Permission[] = []) {
  useApp.setState({ ...initialState, self, users: [dona, mod, ana], access: access(modPermissions) })
}

async function openAudit() {
  render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
  await userEvent.click(screen.getByRole('tab', { name: 'Auditoria' }))
}

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
})

afterEach(() => {
  cleanup()
  setSocket(null)
})

describe('aba Auditoria', () => {
  it('a dona vê a lista em frases, com a hora, e carrega mais a partir da última', async () => {
    login(dona)
    socket.replyTo('audit:list', () => ({ ok: true, entries: [ban('e2')], hasMore: true }))
    await openAudit()
    expect(await screen.findByText('Dona baniu Ana')).toBeTruthy()
    expect(screen.getByText('02/01/2030, 09:05')).toBeTruthy()
    expect(socket.sent('audit:list')[0][0]).toEqual({})

    socket.replyTo('audit:list', () => ({ ok: true, entries: [ban('e1', mod)], hasMore: false }))
    await userEvent.click(screen.getByRole('button', { name: 'Carregar mais' }))
    expect(await screen.findByText('Mod baniu Ana')).toBeTruthy()
    expect(screen.getByText('Dona baniu Ana')).toBeTruthy()
    expect(socket.sent('audit:list')[1][0]).toEqual({ before: 'e2' })
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).toBeNull()
  })

  it('filtra por ação e por pessoa e recomeça a lista', async () => {
    login(dona)
    socket.replyTo('audit:list', () => ({ ok: true, entries: [ban('e2')], hasMore: false }))
    await openAudit()
    await screen.findByText('Dona baniu Ana')

    socket.replyTo('audit:list', () => ({ ok: true, entries: [], hasMore: false }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Ação' }))
    await userEvent.click(screen.getByRole('option', { name: 'Banir' }))
    await waitFor(() => expect(socket.sent('audit:list').at(-1)?.[0]).toEqual({ action: 'ban' }))
    expect(await screen.findByText('Nada registrado ainda.')).toBeTruthy()

    await userEvent.click(screen.getByRole('combobox', { name: 'Pessoa' }))
    await userEvent.click(screen.getByRole('option', { name: 'Mod#mod' }))
    await waitFor(() => expect(socket.sent('audit:list').at(-1)?.[0]).toEqual({ action: 'ban', actorId: 'mod' }))
  })

  it('mostra o erro do servidor', async () => {
    login(dona)
    socket.replyTo('audit:list', () => ({ ok: false, error: 'Você não pode ver o registro de auditoria' }))
    await openAudit()
    expect(await screen.findByText('Você não pode ver o registro de auditoria')).toBeTruthy()
  })

  it('aparece para quem tem Administrador e some para os outros cargos', () => {
    login(mod, ['administrator'])
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Auditoria' })).toBeTruthy()
    cleanup()
    login(mod, ['manageRoles', 'banMembers'])
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    expect(screen.queryByRole('tab', { name: 'Auditoria' })).toBeNull()
  })
})
