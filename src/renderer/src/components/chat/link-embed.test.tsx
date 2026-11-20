// @vitest-environment jsdom
import '@/test/ui-sdk-dom'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Message, User } from '@shared/types'
import { LinkEmbed } from '@/components/chat/LinkEmbed'
import { ChatView } from '@/components/ChatView'
import { TooltipProvider } from '@/components/ui/tooltip'
import { bindEmbedEvents } from '@/lib/actions/embeds'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const ana: User = { id: 'sock-ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const article = { url: 'https://jornal.com/a', title: 'Notícia', description: 'Resumo da notícia', siteName: 'Jornal', imageUrl: '/embeds/m1?a=acc-eu&e=1&s=x' }
const msg = (over: Partial<Message> = {}): Message => ({
  id: 'm1',
  channelId: 'geral',
  author: me,
  content: article.url,
  attachments: [],
  createdAt: 1,
  embed: article,
  ...over
})

let socket: FakeSocket

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  useApp.setState({ ...initialState, self: me, serverUrl: 'http://servidor:3001' })
})
afterEach(() => {
  cleanup()
  setSocket(null)
})

describe('LinkEmbed', () => {
  it('mostra site, título que abre fora, descrição e a imagem servida pelo servidor', () => {
    render(<LinkEmbed message={msg()} />)
    expect(screen.getByText('Jornal')).toBeTruthy()
    const title = screen.getByRole('link', { name: 'Notícia' })
    expect(title.getAttribute('href')).toBe('https://jornal.com/a')
    expect(title.getAttribute('target')).toBe('_blank')
    expect(screen.getByText('Resumo da notícia').className).toContain('line-clamp-3')
    expect(screen.getByRole('img', { name: 'Notícia' }).getAttribute('src')).toBe('http://servidor:3001/embeds/m1?a=acc-eu&e=1&s=x')
  })

  it('aparece abaixo do texto da mensagem no chat e some com o message:embed null', () => {
    Element.prototype.scrollIntoView = () => {}
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    bindEmbedEvents(socket.asSocket())
    useApp.setState({
      channels: [{ id: 'geral', name: 'geral', type: 'text', createdAt: 0 }],
      view: { kind: 'text', channelId: 'geral' },
      messages: { geral: [msg()] },
      hasMoreHistory: { geral: false }
    })
    render(
      <TooltipProvider>
        <ChatView channelId="geral" />
      </TooltipProvider>
    )
    expect(screen.getByRole('link', { name: 'Notícia' })).toBeTruthy()
    act(() => socket.receive('message:embed', { channelId: 'geral', messageId: 'm1', embed: null }))
    expect(screen.queryByRole('link', { name: 'Notícia' })).toBeNull()
  })

  it('sem prévia não desenha nada', () => {
    const { container } = render(<LinkEmbed message={msg({ embed: undefined })} />)
    expect(container.innerHTML).toBe('')
  })

  it('autor remove a prévia; outra pessoa não vê o botão', async () => {
    socket.replyTo('message:embed-remove', () => ({ ok: true }))
    render(<LinkEmbed message={msg()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remover prévia' }))
    expect(socket.sent('message:embed-remove')[0][0]).toEqual({ messageId: 'm1' })
    cleanup()
    render(<LinkEmbed message={msg({ author: ana })} />)
    expect(screen.queryByRole('button', { name: 'Remover prévia' })).toBeNull()
  })

  it('"Tocar no bot" só em link de música e só dentro de uma sala de voz', async () => {
    const music = msg({ author: ana, embed: { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Clipe', music: true } })
    render(<LinkEmbed message={music} />)
    expect(screen.queryByRole('button', { name: 'Tocar no bot' })).toBeNull()
    cleanup()
    useApp.setState({ myVoiceChannelId: 'sala' })
    socket.replyTo('music:play', () => ({ ok: true, state: { channelId: 'sala', nowPlaying: null, queue: [], paused: false, elapsedMs: 0 } }))
    render(<LinkEmbed message={music} />)
    await userEvent.click(screen.getByRole('button', { name: 'Tocar no bot' }))
    expect(socket.sent('music:play')[0][0]).toEqual({ channelId: 'sala', query: 'https://youtu.be/dQw4w9WgXcQ', textChannelId: 'geral' })
    cleanup()
    render(<LinkEmbed message={msg()} />)
    expect(screen.queryByRole('button', { name: 'Tocar no bot' })).toBeNull()
  })
})
