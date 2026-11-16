// @vitest-environment jsdom
// Moderação na tela (B6): itens do botão direito, ícone de silenciado por moderador e apagar mensagem.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EVERYONE_ROLE_ID,
  type AccessState,
  type Channel,
  type Message,
  type Permission,
  type User,
  type VoiceState
} from '@shared/types'
import { ChannelSidebar } from '@/components/ChannelSidebar'
import { MessageActions } from '@/components/chat/MessageActions'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { VoiceGrid } from './VoiceGrid'

const user = (accountId: string, name: string): User => ({
  id: `sock-${accountId}`,
  accountId,
  name,
  tag: accountId.slice(0, 5),
  color: '#aaaaaa',
  avatarUrl: null
})
const voiceState = (u: User, over: Partial<VoiceState> = {}): VoiceState => ({
  userId: u.id,
  channelId: 'sala',
  muted: false,
  deafened: false,
  sharing: false,
  ...over
})

const dona = user('dona', 'Dona')
const mod = user('mod', 'Mod')
const ana = user('ana', 'Ana')
const sala: Channel = { id: 'sala', name: 'Sala', type: 'voice', createdAt: 0 }
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const dm: Channel = { id: 'dm1', name: 'dm', type: 'dm', createdAt: 0 }

function access(modPermissions: Permission[]): AccessState {
  return {
    ownerAccountId: 'dona',
    roles: [
      { id: EVERYONE_ROLE_ID, name: '@todos', color: null, position: 0, permissions: ['view', 'send', 'connect', 'speak'] },
      { id: 'r-mod', name: 'Mod', color: null, position: 1, permissions: modPermissions }
    ],
    members: [{ accountId: 'mod', roleIds: ['r-mod'] }],
    overrides: []
  }
}

let socket: FakeSocket

function login(self: User, modPermissions: Permission[] = ['manageMembers'], voice: VoiceState[] = []) {
  useApp.setState({
    ...initialState,
    self,
    users: [dona, mod, ana],
    channels: [sala, geral],
    // conversas privadas não vêm em `channels`, só em `dms`
    dms: [{ channel: dm, other: { id: 'ana', name: 'Ana', tag: 'ana', color: '#aaaaaa', avatarUrl: null } }],
    voice,
    myVoiceChannelId: voice.some((v) => v.userId === self.id) ? 'sala' : null,
    access: access(modPermissions)
  })
}

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  socket.replyTo('moderation:voice-kick', () => ({ ok: true }))
  socket.replyTo('moderation:voice-mute', () => ({ ok: true }))
  socket.replyTo('message:delete', () => ({ ok: true }))
  vi.spyOn(voice, 'setUserVolume').mockImplementation(() => {})
  vi.spyOn(voice, 'setUserMuted').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.restoreAllMocks()
})

const members = (): VoiceState[] => useApp.getState().voice
function menuOn(name: string): HTMLElement {
  fireEvent.contextMenu(screen.getByText(name))
  return screen.getByRole('menu')
}

describe('botão direito na sala de voz', () => {
  it('moderador vê "Silenciar para todos" e "Expulsar da voz" em quem está abaixo', async () => {
    login(mod, ['manageMembers'], [voiceState(mod), voiceState(ana)])
    render(<VoiceGrid members={members()} />)
    const menu = menuOn('Ana')
    await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name: /Silenciar para todos/ }))
    expect(socket.sent('moderation:voice-mute')[0][0]).toEqual({ accountId: 'ana', muted: true })

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Expulsar da voz/ }))
    expect(socket.sent('moderation:voice-kick')[0][0]).toEqual({ userId: ana.id })
  })

  it('cancelar a confirmação não expulsa', async () => {
    login(dona, [], [voiceState(dona), voiceState(ana)])
    render(<VoiceGrid members={members()} />)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await userEvent.click(within(menuOn('Ana')).getByRole('menuitem', { name: /Expulsar da voz/ }))
    expect(socket.sent('moderation:voice-kick')).toHaveLength(0)
  })

  it('sem gerenciar membros, ou sobre a dona, os itens não aparecem', () => {
    login(mod, [], [voiceState(mod), voiceState(ana), voiceState(dona)])
    render(<VoiceGrid members={members()} />)
    expect(within(menuOn('Ana')).queryByRole('menuitem', { name: /Expulsar da voz/ })).toBeNull()
    cleanup()

    login(mod, ['manageMembers'], [voiceState(mod), voiceState(dona)])
    render(<VoiceGrid members={members()} />)
    expect(within(menuOn('Dona')).queryByRole('menuitem', { name: /Expulsar da voz/ })).toBeNull()
  })

  it('silenciada por moderador: ícone próprio na grade e o item vem marcado', () => {
    login(dona, [], [voiceState(dona), voiceState(ana, { muted: true, serverMuted: true })])
    render(<VoiceGrid members={members()} />)
    expect(screen.getByLabelText('Silenciado por um moderador')).toBeTruthy()
    const item = within(menuOn('Ana')).getByRole('menuitemcheckbox', { name: /Silenciar para todos/ })
    expect(item.getAttribute('aria-checked')).toBe('true')
  })
})

describe('apagar mensagem', () => {
  const msg = (author: User, channelId = 'geral'): Message => ({
    id: `m-${author.accountId}`,
    channelId,
    author,
    content: 'oi',
    attachments: [],
    createdAt: 0
  })

  it('o autor apaga a própria (com confirmação)', async () => {
    login(ana)
    render(<MessageActions message={msg(ana)} />)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Apagar mensagem' }))
    expect(socket.sent('message:delete')[0][0]).toEqual({ messageId: 'm-ana' })
  })

  it('mensagem de outra pessoa: só com gerenciar mensagens', () => {
    login(ana)
    render(<MessageActions message={msg(dona)} />)
    expect(screen.queryByRole('button', { name: 'Apagar mensagem' })).toBeNull()
    cleanup()

    login(mod, ['manageMessages'])
    render(<MessageActions message={msg(ana)} />)
    expect(screen.getByRole('button', { name: 'Apagar mensagem' })).toBeTruthy()
  })

  it('em conversa privada não há moderação: nem a dona apaga a do outro', () => {
    login(dona)
    render(<MessageActions message={msg(ana, 'dm1')} />)
    expect(screen.queryByRole('button', { name: 'Apagar mensagem' })).toBeNull()
  })
})

describe('mover para outra sala (botão direito e arrastar)', () => {
  const jogos: Channel = { id: 'jogos', name: 'Jogos', type: 'voice', createdAt: 0 }
  const fechada: Channel = { id: 'fechada', name: 'Fechada', type: 'voice', createdAt: 0 }
  function withRooms(): void {
    const st = useApp.getState()
    useApp.setState({
      channels: [sala, geral, jogos, fechada],
      // ninguém além da dona entra na "Fechada"
      access: { ...st.access!, overrides: [{ channelId: 'fechada', roleId: EVERYONE_ROLE_ID, allow: [], deny: ['connect'] }] }
    })
  }
  beforeEach(() => {
    socket.replyTo('moderation:voice-move', () => ({ ok: true }))
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('"Mover para" lista as salas de voz em que a pessoa pode entrar (menos a atual) e manda o pedido', async () => {
    login(mod, ['manageMembers'], [voiceState(mod), voiceState(ana)])
    withRooms()
    render(<VoiceGrid members={members()} />)
    const menu = menuOn('Ana')
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Mover para/ }))
    const sub = await screen.findByRole('menu', { name: 'Mover para' })
    expect(within(sub).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Jogos']) // sem "Sala" (atual) e sem "Fechada"
    await userEvent.click(within(sub).getByRole('menuitem', { name: 'Jogos' }))
    expect(socket.sent('moderation:voice-move')).toEqual([[{ userId: ana.id, channelId: 'jogos' }]])
  })

  it('sem gerenciar membros (ou sobre a dona) não aparece', () => {
    login(mod, [], [voiceState(mod), voiceState(ana)])
    withRooms()
    render(<VoiceGrid members={members()} />)
    expect(within(menuOn('Ana')).queryByRole('menuitem', { name: /Mover para/ })).toBeNull()
  })

  it('barra lateral: moderador arrasta a pessoa para outra sala; soltar na mesma sala não faz nada', () => {
    login(mod, ['manageMembers'], [voiceState(mod), voiceState(ana)])
    withRooms()
    render(
      <TooltipProvider>
        <ChannelSidebar />
      </TooltipProvider>
    )
    const anaRow = screen.getAllByText('Ana').map((el) => el.closest('[draggable]') as HTMLElement).find(Boolean)!
    expect(anaRow.getAttribute('draggable')).toBe('true')
    const data = new Map<string, string>()
    const dataTransfer = {
      get types() {
        return [...data.keys()]
      },
      setData: (k: string, v: string) => void data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      effectAllowed: '',
      dropEffect: ''
    }
    fireEvent.dragStart(anaRow, { dataTransfer })
    const target = document.querySelector('[data-voice-room="jogos"]') as HTMLElement
    fireEvent.dragOver(target, { dataTransfer })
    expect(target.dataset.dropTarget).toBe('true')
    fireEvent.drop(target, { dataTransfer })
    expect(socket.sent('moderation:voice-move')).toEqual([[{ userId: ana.id, channelId: 'jogos' }]])

    const same = document.querySelector('[data-voice-room="sala"]') as HTMLElement
    fireEvent.drop(same, { dataTransfer })
    expect(socket.sent('moderation:voice-move')).toHaveLength(1)
  })

  it('com "Mover membros": "Mover para" aparece, mas silenciar e expulsar não', () => {
    login(mod, ['moveMembers'], [voiceState(mod), voiceState(ana)])
    withRooms()
    render(<VoiceGrid members={members()} />)
    const menu = menuOn('Ana')
    expect(within(menu).getByRole('menuitem', { name: /Mover para/ })).toBeTruthy()
    expect(within(menu).queryByRole('menuitemcheckbox', { name: /Silenciar para todos/ })).toBeNull()
    expect(within(menu).queryByRole('menuitem', { name: /Expulsar da voz/ })).toBeNull()
  })

  it('com "Mover membros", a pessoa é arrastável na barra lateral', () => {
    login(mod, ['moveMembers'], [voiceState(mod), voiceState(ana)])
    withRooms()
    render(
      <TooltipProvider>
        <ChannelSidebar />
      </TooltipProvider>
    )
    const anaRow = screen.getAllByText('Ana').map((el) => el.closest('[draggable]') as HTMLElement).find(Boolean)!
    expect(anaRow.getAttribute('draggable')).toBe('true')
  })

  it('sem poder moderar, a pessoa não é arrastável', () => {
    login(mod, [], [voiceState(mod), voiceState(ana)])
    withRooms()
    render(
      <TooltipProvider>
        <ChannelSidebar />
      </TooltipProvider>
    )
    const anaRow = screen.getAllByText('Ana').map((el) => el.closest('[draggable]') as HTMLElement).find(Boolean)!
    expect(anaRow.getAttribute('draggable')).toBe('false')
  })
})
