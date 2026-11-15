// @vitest-environment jsdom
// Links na mensagem: viram <a> que abre fora do app (target _blank → navegador padrão pelo
// processo principal), convivem com as menções e não pegam pontuação da frase.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Message, User } from '@shared/types'
import { MessageText } from '@/components/chat/MessageText'
import { initialState, useApp } from '@/store'

const ANA = 'aaaaaaaa-0000-0000-0000-000000000002'
const ana: User = { id: 'sock-ana', accountId: ANA, name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const msg = (content: string, over: Partial<Message> = {}): Message => ({ id: 'm1', channelId: 'geral', author: ana, content, attachments: [], createdAt: 1, ...over })

beforeEach(() => useApp.setState({ ...initialState, self: ana, users: [ana] }))
afterEach(cleanup)

describe('links na mensagem', () => {
  it('link vira <a> que abre no navegador, sem a pontuação do fim', () => {
    const { container } = render(<p><MessageText message={msg('olha https://exemplo.com/x?y=1.')} /></p>)
    const link = screen.getByRole('link', { name: 'https://exemplo.com/x?y=1' })
    expect(link.getAttribute('href')).toBe('https://exemplo.com/x?y=1')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(container.textContent).toBe('olha https://exemplo.com/x?y=1.')
  })

  it('www. aponta para https', () => {
    render(<MessageText message={msg('site: www.concord.app')} />)
    expect(screen.getByRole('link', { name: 'www.concord.app' }).getAttribute('href')).toBe('https://www.concord.app/')
  })

  it('link e menção na mesma mensagem', () => {
    const { container } = render(<MessageText message={msg(`<@${ANA}> vê https://a.com`, { mentions: [{ accountId: ANA, name: 'Ana' }] })} />)
    expect(container.querySelector('[data-mention]')?.textContent).toBe('@Ana')
    expect(screen.getByRole('link', { name: 'https://a.com' })).toBeTruthy()
  })

  it('texto sem link e endereço perigoso continuam texto comum', () => {
    render(<MessageText message={msg('javascript:alert(1) e file:///C:/x')} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
