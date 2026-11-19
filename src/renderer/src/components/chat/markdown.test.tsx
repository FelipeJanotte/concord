// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Message, User } from '@shared/types'
import { MessageText } from '@/components/chat/MessageText'
import { initialState, useApp } from '@/store'

const ANA = 'aaaaaaaa-0000-0000-0000-000000000002'
const ana: User = { id: 'sock-ana', accountId: ANA, name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }
const msg = (content: string): Message => ({
  id: 'm1',
  channelId: 'geral',
  author: ana,
  content,
  attachments: [],
  createdAt: 1,
  mentions: [{ accountId: ANA, name: 'Ana' }]
})
const draw = (content: string) => render(<p><MessageText message={msg(content)} /></p>).container

beforeEach(() => useApp.setState({ ...initialState, self: ana, users: [ana] }))
afterEach(cleanup)

describe('formatação na mensagem', () => {
  it('negrito, itálico e riscado viram strong, em e s sem os marcadores', () => {
    const box = draw('**forte** *inclinado* ~~velho~~')
    expect(box.querySelector('strong')?.textContent).toBe('forte')
    expect(box.querySelector('em')?.textContent).toBe('inclinado')
    expect(box.querySelector('s')?.textContent).toBe('velho')
    expect(box.textContent).toBe('forte inclinado velho')
  })

  it('HTML no texto aparece como texto, sem virar elemento', () => {
    const box = draw('<b>oi</b><img src=x onerror=alert(1)>')
    expect(box.querySelector('b')).toBeNull()
    expect(box.querySelector('img')).toBeNull()
    expect(box.textContent).toBe('<b>oi</b><img src=x onerror=alert(1)>')
  })

  it('dentro de código não há menção nem link', () => {
    const box = draw(`\`<@${ANA}> https://a.com\` e <@${ANA}> https://b.com`)
    const code = box.querySelector('code')
    expect(code?.textContent).toBe(`<@${ANA}> https://a.com`)
    expect(code?.querySelector('[data-mention], a')).toBeNull()
    expect(box.querySelectorAll('[data-mention]')).toHaveLength(1)
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['https://b.com/'])
  })

  it('menção e link continuam funcionando dentro de negrito', () => {
    const box = draw(`**<@${ANA}> https://a.com**`)
    expect(box.querySelector('strong [data-mention]')?.textContent).toBe('@Ana')
    expect(box.querySelector('strong a')?.getAttribute('href')).toBe('https://a.com/')
  })

  it('bloco de código sem linha da linguagem e com o texto como veio', () => {
    const box = draw('olha:\n```js\nconst x = *1*\n```')
    const block = box.querySelector('[data-code-block]')
    expect(block?.textContent).toBe('const x = *1*')
    expect(block?.querySelector('em')).toBeNull()
  })

  it('citação desenha a barra e a formatação dentro', () => {
    const box = draw('> **atenção**\nok')
    const quote = box.querySelector('blockquote, [data-quote]')
    expect(quote?.querySelector('strong')?.textContent).toBe('atenção')
    expect(box.textContent).toBe('atençãook')
  })

  it('spoiler fica escondido até o clique, e o link dentro não abre antes', () => {
    const box = draw('fim: ||https://a.com||')
    const spoiler = screen.getByRole('button', { name: 'Spoiler: clique para ver' })
    expect(spoiler.getAttribute('data-revealed')).toBe('false')
    const link = box.querySelector('a')!
    const blocked = !fireEvent.click(link)
    expect(blocked).toBe(true)
    expect(spoiler.getAttribute('data-revealed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Spoiler: clique para ver' })).toBeNull()
    expect(fireEvent.click(link)).toBe(true)
  })

  it('spoiler abre pelo teclado', () => {
    draw('||segredo||')
    const spoiler = screen.getByRole('button', { name: 'Spoiler: clique para ver' })
    fireEvent.keyDown(spoiler, { key: 'Enter' })
    expect(spoiler.getAttribute('data-revealed')).toBe('true')
  })
})
