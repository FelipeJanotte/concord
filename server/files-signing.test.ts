import { describe, expect, it } from 'vitest'
import type { Attachment, Message } from '../src/shared/types'
import { FILE_URL_TTL_MS, signFileUrl, signMessage, verifyFileQuery } from './files-signing'

const att: Attachment = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'foto.png',
  size: 3,
  contentType: 'image/png',
  url: '/files/11111111-1111-1111-1111-111111111111/foto.png',
  width: null,
  height: null
}

const query = (url: string) => new URL(url, 'http://x').searchParams

describe('links assinados', () => {
  it('assina para a conta e confere de volta', () => {
    const url = signFileUrl(att, 'conta-a', 1_000)
    expect(url.startsWith(`${att.url}?`)).toBe(true)
    expect(verifyFileQuery(att.id, query(url), 2_000)).toBe('conta-a')
  })

  it('expira depois da validade', () => {
    const url = signFileUrl(att, 'conta-a', 1_000)
    expect(verifyFileQuery(att.id, query(url), 1_000 + FILE_URL_TTL_MS)).toBe('conta-a')
    expect(verifyFileQuery(att.id, query(url), 1_000 + FILE_URL_TTL_MS + 1)).toBeNull()
  })

  it('recusa assinatura falsa, outra conta, outra validade, outro anexo ou faltando campo', () => {
    const q = query(signFileUrl(att, 'conta-a', 1_000))
    const tweak = (k: string, v: string) => {
      const c = new URLSearchParams(q)
      c.set(k, v)
      return c
    }
    expect(verifyFileQuery(att.id, tweak('s', 'falsa'), 2_000)).toBeNull()
    expect(verifyFileQuery(att.id, tweak('a', 'conta-b'), 2_000)).toBeNull()
    expect(verifyFileQuery(att.id, tweak('e', String(Number(q.get('e')) + 1)), 2_000)).toBeNull()
    expect(verifyFileQuery('22222222-2222-2222-2222-222222222222', q, 2_000)).toBeNull()
    const missing = new URLSearchParams(q)
    missing.delete('a')
    expect(verifyFileQuery(att.id, missing, 2_000)).toBeNull()
    expect(verifyFileQuery(att.id, new URLSearchParams(), 2_000)).toBeNull()
  })

  it('assinar de novo um link já assinado não acumula parâmetros', () => {
    const once = signFileUrl(att, 'a', 1_000)
    const twice = signFileUrl({ ...att, url: once }, 'b', 1_000)
    expect(query(twice).getAll('a')).toEqual(['b'])
  })

  it('signMessage assina todos os anexos e não mexe em mensagem sem anexo', () => {
    const msg: Message = {
      id: 'm',
      channelId: 'c',
      author: { id: 's', accountId: 'x', name: 'X', tag: '', color: '#000', avatarUrl: null },
      content: 'oi',
      attachments: [att, { ...att, id: '33333333-3333-3333-3333-333333333333' }],
      createdAt: 0
    }
    const signed = signMessage(msg, 'conta-a', 1_000)
    expect(signed.attachments.every((a) => verifyFileQuery(a.id, query(a.url), 2_000) === 'conta-a')).toBe(true)
    expect(msg.attachments[0].url).toBe(att.url) // não altera o original
    const plain = { ...msg, attachments: [] }
    expect(signMessage(plain, 'conta-a')).toBe(plain)
  })

  it('signMessage assina a imagem da prévia de link amarrada ao id da mensagem', () => {
    const msg: Message = {
      id: '44444444-4444-4444-4444-444444444444',
      channelId: 'c',
      author: { id: 's', accountId: 'x', name: 'X', tag: '', color: '#000', avatarUrl: null },
      content: 'https://a.com',
      attachments: [],
      createdAt: 0,
      embed: { url: 'https://a.com', title: 'A', imageUrl: '/embeds/44444444-4444-4444-4444-444444444444' }
    }
    const imageUrl = signMessage(msg, 'conta-a', 1_000).embed!.imageUrl!
    expect(imageUrl.startsWith('/embeds/44444444-4444-4444-4444-444444444444?')).toBe(true)
    expect(verifyFileQuery(msg.id, query(imageUrl), 2_000)).toBe('conta-a')
    const textOnly = { ...msg, embed: { url: 'https://a.com', title: 'A' } }
    expect(signMessage(textOnly, 'conta-a').embed).toEqual(textOnly.embed)
  })
})
