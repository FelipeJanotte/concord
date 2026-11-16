// @vitest-environment jsdom
// Tela de administração (B5): configurações da comunidade, permissões do canal, o que some sem permissão,
// cargos e cores na lista de membros e o item "Cargos" no botão direito.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EVERYONE_ROLE_ID, type AccessState, type Channel, type Role, type User } from '@shared/types'
import { ChannelSidebar } from '@/components/ChannelSidebar'
import { Composer } from '@/components/chat/Composer'
import { MemberList } from '@/components/MemberList'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { ChannelPermissionsDialog } from './ChannelPermissionsDialog'
import { CommunitySettingsDialog } from './CommunitySettingsDialog'

const user = (accountId: string, name: string): User => ({
  id: `sock-${accountId}`,
  accountId,
  name,
  tag: accountId.slice(0, 5),
  color: '#aaaaaa',
  avatarUrl: null
})

const everyone: Role = { id: EVERYONE_ROLE_ID, name: '@todos', color: null, position: 0, permissions: ['view', 'send', 'attach', 'connect'] }
const mod: Role = { id: 'mod', name: 'Mod', color: '#ff0000', position: 2, permissions: ['manageMembers'] }
const vip: Role = { id: 'vip', name: 'VIP', color: '#00ff00', position: 1, permissions: [] }

const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const segredo: Channel = { id: 'segredo', name: 'segredo', type: 'text', createdAt: 0 }
const sala: Channel = { id: 'sala', name: 'Sala', type: 'voice', createdAt: 0 }

const baseAccess = (): AccessState => ({
  ownerAccountId: 'dona',
  roles: [everyone, mod, vip],
  members: [
    { accountId: 'bia', roleIds: ['mod'] },
    { accountId: 'caio', roleIds: ['vip'] }
  ],
  overrides: [{ channelId: 'segredo', roleId: EVERYONE_ROLE_ID, allow: [], deny: ['view'] }]
})

let socket: FakeSocket

// o tooltip do Radix mede o botão ao passar o mouse; o jsdom não tem ResizeObserver
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

function login(accountId: string, access: AccessState = baseAccess()) {
  useApp.setState({
    ...initialState,
    self: user(accountId, accountId),
    users: [user('dona', 'Dona'), user('bia', 'Bia'), user('caio', 'Caio'), user('davi', 'Davi')],
    channels: [geral, segredo, sala],
    view: { kind: 'text', channelId: 'geral' },
    access
  })
}

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  socket.replyTo('role:create', (payload) => ({ ok: true, role: { ...vip, id: 'novo', ...(payload as object), position: 3 } }))
  socket.replyTo('role:update', (payload) => ({ ok: true, role: { ...mod, ...(payload as object) } }))
  socket.replyTo('member:set-roles', () => ({ ok: true }))
  socket.replyTo('channel:set-overrides', () => ({ ok: true }))
  socket.replyTo('role:reorder', () => ({ ok: true }))
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.restoreAllMocks()
})

const sidebar = () =>
  render(
    <TooltipProvider>
      <ChannelSidebar />
    </TooltipProvider>
  )

describe('barra lateral', () => {
  it('sem permissões: sem engrenagem da comunidade, sem + e sem ações nos canais', () => {
    login('davi')
    sidebar()
    expect(screen.queryByRole('button', { name: 'Configurações da comunidade' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Criar canal' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Permissões do canal' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Excluir canal' })).toBeNull()
  })

  it('dona vê tudo, e o canal privado tem cadeado', () => {
    login('dona')
    sidebar()
    expect(screen.getByRole('button', { name: 'Configurações da comunidade' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Criar canal' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Permissões do canal' })).toHaveLength(3)
    expect(screen.getAllByLabelText('Canal privado')).toHaveLength(1)
  })

  it('clicar e digitar dentro das permissões de uma sala não abre a sala nem entra na voz', async () => {
    login('dona')
    sidebar()
    await userEvent.click(screen.getAllByRole('button', { name: 'Permissões do canal' })[2]) // Sala (voz)
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Canal privado/ }))
    await userEvent.keyboard(' ')
    await userEvent.click(within(dialog).getAllByRole('radio', { name: 'Liberar' })[0])
    expect(useApp.getState().view).toEqual({ kind: 'text', channelId: 'geral' })
    expect(socket.sent('voice:join')).toHaveLength(0)
  })

  it('só gerenciar membros já mostra a engrenagem da comunidade, mas não as ações de canal', () => {
    login('bia')
    sidebar()
    expect(screen.getByRole('button', { name: 'Configurações da comunidade' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Criar canal' })).toBeNull()
  })
})

describe('Configurações da comunidade — Cargos', () => {
  it('dona cria um cargo', async () => {
    login('dona')
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Criar cargo/ }))
    expect(socket.sent('role:create')[0][0]).toEqual({ name: 'novo cargo', color: null, permissions: [] })
  })

  it('editar nome, cor e permissão e salvar manda role:update', async () => {
    login('dona')
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    await userEvent.click(within(screen.getByRole('list', { name: 'Cargos' })).getByRole('button', { name: 'Mod' }))
    const name = screen.getByLabelText('Nome do cargo')
    await userEvent.clear(name)
    await userEvent.type(name, 'Moderação')
    await userEvent.click(screen.getByRole('checkbox', { name: /Gerenciar mensagens/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(socket.sent('role:update')[0][0]).toEqual({
      id: 'mod',
      name: 'Moderação',
      color: '#ff0000',
      permissions: ['manageMembers', 'manageMessages']
    })
  })

  it('marcar "Mover membros" num cargo manda moveMembers', async () => {
    login('dona')
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    await userEvent.click(within(screen.getByRole('list', { name: 'Cargos' })).getByRole('button', { name: 'Mod' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Mover membros/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(socket.sent('role:update')[0][0]).toMatchObject({ id: 'mod', permissions: ['manageMembers', 'moveMembers'] })
  })

  it('@todos: sem nome nem cor, e só permissões', async () => {
    login('dona')
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    await userEvent.click(within(screen.getByRole('list', { name: 'Cargos' })).getByRole('button', { name: '@todos' }))
    expect(screen.queryByLabelText('Nome do cargo')).toBeNull()
    await userEvent.click(screen.getByRole('checkbox', { name: /Compartilhar a tela/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(socket.sent('role:update')[0][0]).toEqual({
      id: EVERYONE_ROLE_ID,
      permissions: ['view', 'send', 'attach', 'connect', 'share']
    })
  })

  it('subir um cargo manda a ordem nova (do menos para o mais importante)', async () => {
    login('dona')
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Subir VIP' }))
    expect(socket.sent('role:reorder')[0][0]).toEqual(['mod', 'vip'])
  })

  it('cargo no meu nível fica só para ver; permissão que não tenho fica travada', async () => {
    const access = baseAccess()
    access.roles = access.roles.map((r) => (r.id === 'mod' ? { ...r, permissions: ['manageRoles', 'manageMembers'] } : r))
    login('bia', access)
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /Criar cargo/ })).toBeTruthy()
    // Mod é o cargo da própria Bia
    expect(screen.getByText(/só dá para ver/)).toBeTruthy()
    await userEvent.click(within(screen.getByRole('list', { name: 'Cargos' })).getByRole('button', { name: 'VIP' }))
    expect((screen.getByRole('checkbox', { name: /Gerenciar canais/ }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('checkbox', { name: /Gerenciar membros/ }) as HTMLInputElement).disabled).toBe(false)
  })
})

describe('Configurações da comunidade — Membros', () => {
  it('marcar um cargo numa pessoa manda member:set-roles com os cargos dela', async () => {
    login('dona')
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Membros' }))
    const caio = screen.getByRole('group', { name: 'Cargos de Caio' })
    await userEvent.click(within(caio).getByRole('checkbox', { name: /Mod/ }))
    expect(socket.sent('member:set-roles')[0][0]).toEqual({ accountId: 'caio', roleIds: ['vip', 'mod'] })
  })

  it('quem gerencia membros não mexe em quem está acima nem dá cargo do seu nível', async () => {
    login('bia')
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Membros' }))
    const dona = screen.getByRole('group', { name: 'Cargos de Dona' })
    expect(within(dona).getAllByRole('checkbox').every((c) => (c as HTMLInputElement).disabled)).toBe(true)
    const caio = screen.getByRole('group', { name: 'Cargos de Caio' })
    expect((within(caio).getByRole('checkbox', { name: /Mod/ }) as HTMLInputElement).disabled).toBe(true)
    expect((within(caio).getByRole('checkbox', { name: /VIP/ }) as HTMLInputElement).disabled).toBe(false)
  })
})

describe('Permissões do canal', () => {
  it('tornar privado e liberar ver para um cargo', async () => {
    login('dona')
    render(<ChannelPermissionsDialog channel={geral} open onOpenChange={() => {}} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /Canal privado/ }))
    await userEvent.click(within(screen.getByRole('list', { name: 'Cargos' })).getByRole('button', { name: 'VIP' }))
    const view = screen.getByRole('radiogroup', { name: 'Ver o canal' })
    await userEvent.click(within(view).getByRole('radio', { name: 'Liberar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(socket.sent('channel:set-overrides')[0][0]).toEqual({
      channelId: 'geral',
      overrides: [
        { roleId: EVERYONE_ROLE_ID, allow: [], deny: ['view'] },
        { roleId: 'vip', allow: ['view'], deny: [] }
      ]
    })
  })

  it('abre com as regras atuais; voltar para Herdar remove a regra', async () => {
    login('dona')
    render(<ChannelPermissionsDialog channel={segredo} open onOpenChange={() => {}} />)
    expect((screen.getByRole('checkbox', { name: /Canal privado/ }) as HTMLInputElement).checked).toBe(true)
    const view = screen.getByRole('radiogroup', { name: 'Ver o canal' })
    expect(within(view).getByRole('radio', { name: 'Negar' }).getAttribute('aria-checked')).toBe('true')
    await userEvent.click(within(view).getByRole('radio', { name: 'Herdar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(socket.sent('channel:set-overrides')[0][0]).toEqual({ channelId: 'segredo', overrides: [] })
  })

  it('canal de voz mostra as permissões de voz', () => {
    login('dona')
    render(<ChannelPermissionsDialog channel={sala} open onOpenChange={() => {}} />)
    expect(screen.getByRole('radiogroup', { name: 'Falar na voz' })).toBeTruthy()
    expect(screen.queryByRole('radiogroup', { name: 'Enviar mensagens' })).toBeNull()
  })
})

describe('campo de mensagem', () => {
  it('sem enviar: aviso no lugar do campo', () => {
    const access = baseAccess()
    access.overrides.push({ channelId: 'geral', roleId: EVERYONE_ROLE_ID, allow: [], deny: ['send'] })
    login('davi', access)
    render(<Composer channel={geral} />)
    expect(screen.getByText('Você não tem permissão para enviar mensagens neste canal.')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('sem anexar: some o clipe, o texto continua', () => {
    const access = baseAccess()
    access.overrides.push({ channelId: 'geral', roleId: EVERYONE_ROLE_ID, allow: [], deny: ['attach'] })
    login('davi', access)
    render(<Composer channel={geral} />)
    expect(screen.queryByRole('button', { name: 'Anexar arquivo' })).toBeNull()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })
})

describe('lista de membros', () => {
  it('agrupa pelo cargo mais alto e pinta o nome com a cor do cargo', () => {
    login('dona')
    render(<MemberList />)
    const groups = screen.getAllByRole('region').map((g) => g.getAttribute('aria-label'))
    expect(groups).toEqual(['Mod', 'VIP', 'Online'])
    expect(within(screen.getByRole('region', { name: 'Online' })).getByText('Dona')).toBeTruthy()
    expect((screen.getByText('Bia') as HTMLElement).style.color).toBe('rgb(255, 0, 0)')
    expect((screen.getByText('Davi') as HTMLElement).style.color).toBe('rgb(170, 170, 170)')
  })
})

describe('botão direito: Cargos', () => {
  it('quem gerencia membros vê o submenu Cargos; quem não gerencia, não', () => {
    login('dona')
    const { unmount } = render(<MemberList />)
    fireEvent.contextMenu(screen.getByText('Caio'))
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Cargos/ })).toBeTruthy()
    unmount()

    login('davi')
    render(<MemberList />)
    fireEvent.contextMenu(screen.getByText('Caio'))
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: /Cargos/ })).toBeNull()
  })
})

describe('alterar cargos dos membros (assignRoles)', () => {
  const assignerAccess = (): AccessState => ({
    ...baseAccess(),
    roles: [everyone, { ...mod, permissions: ['assignRoles'] }, vip]
  })

  it('só com assignRoles aparece a engrenagem da comunidade', () => {
    login('bia', assignerAccess())
    sidebar()
    expect(screen.getByRole('button', { name: 'Configurações da comunidade' })).toBeTruthy()
  })

  it('a tela de cargos oferece a permissão para marcar', async () => {
    login('dona')
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    await userEvent.click(within(screen.getByRole('list', { name: 'Cargos' })).getByRole('button', { name: 'VIP' }))
    expect(screen.getByRole('checkbox', { name: 'Alterar cargos dos membros (só cargos abaixo do seu)' })).toBeTruthy()
  })

  it('Membros: dá cargo abaixo a quem está abaixo; não mexe em si mesmo', async () => {
    login('bia', assignerAccess())
    render(<CommunitySettingsDialog open onOpenChange={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Membros' }))
    const bia = screen.getByRole('group', { name: 'Cargos de Bia' })
    expect(within(bia).getAllByRole('checkbox').every((c) => (c as HTMLInputElement).disabled)).toBe(true)
    const davi = screen.getByRole('group', { name: 'Cargos de Davi' })
    expect((within(davi).getByRole('checkbox', { name: /Mod/ }) as HTMLInputElement).disabled).toBe(true)
    await userEvent.click(within(davi).getByRole('checkbox', { name: /VIP/ }))
    expect(socket.sent('member:set-roles')[0][0]).toEqual({ accountId: 'davi', roleIds: ['vip'] })
  })

  it('botão direito: Cargos só com os cargos abaixo, e não em si mesmo', async () => {
    login('bia', assignerAccess())
    const { unmount } = render(<MemberList />)
    fireEvent.contextMenu(screen.getByText('Caio'))
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Cargos/ }))
    const submenu = await screen.findByRole('menu', { name: 'Cargos' })
    expect(within(submenu).getAllByRole('menuitemcheckbox').map((i) => i.textContent)).toEqual(['VIP'])
    unmount()

    render(<MemberList />)
    fireEvent.contextMenu(screen.getByText('Bia'))
    expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: /Cargos/ })).toBeNull()
  })
})
