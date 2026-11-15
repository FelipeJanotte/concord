// @vitest-environment jsdom
// Menções (B19) na tela: autocompletar no campo (quem vê o canal, @todos com permissão, conversa
// privada), envio com o token, "@Nome" na mensagem, destaque de quem foi mencionado, edição e a
// notificação da menção num canal.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccessState, Channel, DmEntry, Message, User } from '@shared/types'
import { ChatView } from '@/components/ChatView'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setSocket } from '@/lib/core'
import { messageNotification } from '@/lib/notifications'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const ME = 'aaaaaaaa-0000-0000-0000-000000000001'
const ANA = 'aaaaaaaa-0000-0000-0000-000000000002'
const BIA = 'aaaaaaaa-0000-0000-0000-000000000003'
const user = (accountId: string, name: string): User => ({ id: `sock-${name}`, accountId, name, tag: name.toLowerCase(), color: '#fff', avatarUrl: null })
const me = user(ME, 'Eu')
const ana = user(ANA, 'Ana')
const bia = user(BIA, 'Bia')
const geral: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const dm: DmEntry = { channel: { id: 'dm-ana', name: 'dm', type: 'dm', createdAt: 0 }, other: { id: ANA, name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null } }
const msg = (id: string, author: User, content: string, over: Partial<Message> = {}): Message => ({ id, channelId: 'geral', author, content, attachments: [], createdAt: 1, ...over })
const EVERYONE = '00000000-0000-0000-0000-000000000000'
/** @todos com o básico; Bia não vê o canal geral (regra do canal só para um cargo dela) */
function accessWith(extra: string[] = []): AccessState {
  return {
    ownerAccountId: 'acc-dona',
    roles: [
      { id: EVERYONE, name: '@todos', color: null, position: 0, permissions: ['view', 'send', ...extra] },
      { id: 'r-bia', name: 'bia', color: null, position: 1, permissions: [] }
    ],
    members: [{ accountId: BIA, roleIds: ['r-bia'] }],
    overrides: [{ channelId: 'geral', roleId: 'r-bia', allow: [], deny: ['view'] }]
  } as unknown as AccessState
}

let socket: FakeSocket

function setup(channelId: string, over: Partial<ReturnType<typeof useApp.getState>> = {}): void {
  useApp.setState({
    ...initialState,
    self: me,
    users: [me, ana, bia],
    channels: [geral],
    dms: [dm],
    access: accessWith(),
    messages: { [channelId]: [] },
    hasMoreHistory: { [channelId]: false },
    ...over
  })
  render(
    <TooltipProvider>
      <ChatView channelId={channelId} />
    </TooltipProvider>
  )
}

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
})
afterEach(() => {
  cleanup()
  setSocket(null)
})

describe('autocompletar no campo', () => {
  it('"@" lista quem está online e vê o canal (sem mim e sem quem não vê); Enter escolhe e o envio leva o token', async () => {
    setup('geral')
    const box = screen.getByPlaceholderText('Conversar em #geral')
    await userEvent.type(box, 'oi @')
    const menu = screen.getByRole('listbox', { name: 'Mencionar' })
    expect(within(menu).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ana'])
    await userEvent.keyboard('{Enter}')
    expect((box as HTMLTextAreaElement).value).toBe('oi @Ana ')
    expect(screen.queryByRole('listbox')).toBeNull()
    await userEvent.type(box, 'tudo bem?{Enter}')
    expect(socket.sent('message:send')[0][0]).toEqual({ channelId: 'geral', content: `oi <@${ANA}> tudo bem?` })
  })

  it('@todos só aparece com a permissão; setas mudam a escolha; Esc fecha sem escolher', async () => {
    setup('geral', { access: accessWith(['mentionEveryone']) })
    const box = screen.getByPlaceholderText('Conversar em #geral')
    await userEvent.type(box, '@')
    const options = () => within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options().map((o) => o.textContent?.split('avisa')[0])).toEqual(['todos', 'Ana'])
    expect(options()[0].getAttribute('aria-selected')).toBe('true')
    await userEvent.keyboard('{ArrowDown}')
    expect(options()[1].getAttribute('aria-selected')).toBe('true')
    await userEvent.keyboard('{ArrowUp}{Enter}')
    expect((box as HTMLTextAreaElement).value).toBe('@todos ')
    await userEvent.type(box, '@a')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('digitar "@Ana" sem escolher no menu não vira menção; nada combina = sem menu', async () => {
    setup('geral')
    const box = screen.getByPlaceholderText('Conversar em #geral')
    await userEvent.type(box, '@zz')
    expect(screen.queryByRole('listbox')).toBeNull()
    await userEvent.clear(box)
    await userEvent.type(box, 'falei com @Ana{Escape}{Enter}')
    expect(socket.sent('message:send')[0][0]).toEqual({ channelId: 'geral', content: 'falei com @Ana' })
  })

  it('numa conversa privada só aparece a outra pessoa (sem @todos)', async () => {
    setup('dm-ana', { access: accessWith(['mentionEveryone']), homeView: { kind: 'dm', channelId: 'dm-ana' }, section: 'home' })
    await userEvent.type(screen.getByPlaceholderText('Conversar com @Ana'), '@')
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ana'])
  })
})

describe('na mensagem', () => {
  it('mostra @Nome (do servidor ou de quem está online) e destaca a mensagem que me menciona', () => {
    setup('geral', {
      messages: {
        geral: [
          msg('m1', ana, `oi <@${ME}>!`, { mentions: [{ accountId: ME, name: 'Eu' }] }),
          msg('m2', ana, `falou com <@${BIA}> e <@aaaaaaaa-0000-0000-0000-00000000ffff>`)
        ]
      }
    })
    const first = document.getElementById('msg-m1')!
    expect(first.textContent).toContain('oi @Eu!')
    expect(first.className).toContain('border-primary')
    const second = document.getElementById('msg-m2')!
    expect(second.textContent).toContain('falou com @Bia e @alguém')
    expect(second.className).not.toContain('border-primary')
  })

  it('@todos destaca para todo mundo, menos para quem escreveu', () => {
    setup('geral', { messages: { geral: [msg('m1', ana, '<@todos> reunião'), msg('m2', me, '<@todos> minha')] } })
    expect(document.getElementById('msg-m1')!.className).toContain('border-primary')
    expect(document.getElementById('msg-m2')!.className).not.toContain('border-primary')
  })

  it('editar mostra @Nome no campo e salva o token de volta', async () => {
    socket.replyTo('message:edit', () => ({ ok: true }))
    setup('geral', { messages: { geral: [msg('m1', me, `oi <@${ANA}>`, { mentions: [{ accountId: ANA, name: 'Ana' }] })] } })
    await userEvent.click(within(document.getElementById('msg-m1')!).getByRole('button', { name: 'Editar mensagem' }))
    const box = screen.getByLabelText('Editando a mensagem') as HTMLTextAreaElement
    expect(box.value).toBe('oi @Ana')
    await userEvent.type(box, ', tudo?{Enter}')
    expect(socket.sent('message:edit')[0][0]).toEqual({ messageId: 'm1', content: `oi <@${ANA}>, tudo?` })
  })
})

describe('notificação', () => {
  it('menção num canal (ou @todos) notifica fora de foco com o nome do canal; sem menção, não', () => {
    const st = { ...initialState, self: me, channels: [geral], dms: [] }
    const mention = msg('m1', ana, `<@${ME}> olha isso`, { mentions: [{ accountId: ME, name: 'Eu' }] })
    expect(messageNotification(mention, st, false)).toEqual({
      title: 'Ana em #geral',
      body: '@Eu olha isso',
      target: { kind: 'channel', channelId: 'geral' }
    })
    expect(messageNotification(msg('m2', ana, '<@todos> reunião'), st, false)?.body).toBe('@todos reunião')
    expect(messageNotification(msg('m3', ana, 'nada para mim'), st, false)).toBeNull()
    expect(messageNotification(mention, st, true)).toBeNull()
  })
})
