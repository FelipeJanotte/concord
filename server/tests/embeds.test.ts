import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Message } from '../../src/shared/types'
import { expectNoEvent, TestServer, waitFor, type TestUser } from './helpers'

const PNG = Buffer.from('89504e470d0a1a0a0000000d494844520000001000000008080600000000000000', 'hex')
const EVERYONE = '00000000-0000-0000-0000-000000000000'

let server: TestServer
let web: Server
let site = ''
const open: TestUser[] = []

const html = (head: string): string => `<!doctype html><html><head>${head}</head><body>oi</body></html>`

beforeAll(async () => {
  web = createServer((req, res) => {
    const page = (head: string) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html(head))
    switch (req.url) {
      case '/noticia':
        return page('<meta property="og:title" content="Notícia &amp; fato"><meta property="og:description" content="Resumo"><meta property="og:site_name" content="Jornal">')
      case '/com-imagem':
        return page('<meta property="og:title" content="Com imagem"><meta property="og:image" content="/capa.png">')
      case '/capa.png':
        return res.writeHead(200, { 'content-type': 'image/png' }).end(PNG)
      case '/simples':
        return page('<title>Só o título</title>')
      case '/vazia':
        return page('')
      case '/arquivo':
        return res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF-1.4')
      case '/antiga':
        return res.writeHead(301, { location: '/noticia' }).end()
      case '/outra':
        return page('<meta property="og:title" content="Outra página">')
      case '/lenta':
        return
      default:
        return res.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve))
  site = `http://127.0.0.1:${(web.address() as AddressInfo).port}`
  server = await TestServer.start({ imports: ['./server/tests/fake-web.ts'] })
})
afterEach(() => {
  for (const u of open.splice(0)) u.socket.close()
})
afterAll(async () => {
  await server?.destroy()
  web?.closeAllConnections()
  await new Promise((resolve) => web?.close(resolve))
})

async function user(name: string): Promise<TestUser> {
  const u = await server.newUser(name)
  open.push(u)
  return u
}
const channel = () => server.createChannel(`links-${Math.random().toString(36).slice(2, 7)}`)

async function send(u: TestUser, channelId: string, content: string): Promise<Message> {
  const got = waitFor(u.socket, 'message:new', (m) => m.content === content)
  u.socket.emit('message:send', { channelId, content })
  return (await got)[0]
}

const embedOf = (u: TestUser, messageId: string, ms = 5000) =>
  waitFor(u.socket, 'message:embed', (p) => p.messageId === messageId, ms).then(([p]) => p)

describe('prévia de links', () => {
  it('mensagem com link recebe a prévia; quem vê o canal recebe message:embed e o histórico guarda', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const msg = await send(ana, ch.id, `olha ${site}/noticia`)
    expect(msg.embed).toBeUndefined()
    const update = await embedOf(ana, msg.id)
    expect(update).toEqual({
      channelId: ch.id,
      messageId: msg.id,
      embed: { url: `${site}/noticia`, title: 'Notícia & fato', description: 'Resumo', siteName: 'Jornal' }
    })
    const history = await ana.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(history.messages.find((m) => m.id === msg.id)?.embed).toEqual(update.embed)
  })

  it('canal que a pessoa não vê: a prévia não chega para ela', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const secret = await channel()
    await owner.socket.emitWithAck('channel:set-overrides', { channelId: secret.id, overrides: [{ roleId: EVERYONE, allow: [], deny: ['view'] }] })
    const silent = expectNoEvent(ana.socket, 'message:embed', () => true, 2000)
    const msg = await send(owner, secret.id, `${site}/outra`)
    expect((await embedOf(owner, msg.id)).embed?.title).toBe('Outra página')
    await silent
  })

  it('página sem Open Graph usa o <title>; página vazia, não HTML ou lenta não geram prévia', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const simple = await send(ana, ch.id, `${site}/simples`)
    expect((await embedOf(ana, simple.id)).embed).toEqual({ url: `${site}/simples`, title: 'Só o título' })
    const silent = expectNoEvent(ana.socket, 'message:embed', () => true, 4500)
    await send(ana, ch.id, `${site}/vazia`)
    await send(ana, ch.id, `${site}/arquivo`)
    await send(ana, ch.id, `${site}/lenta`)
    await silent
  })

  it('segue o redirecionamento e mantém o link escrito', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const msg = await send(ana, ch.id, `${site}/antiga`)
    expect((await embedOf(ana, msg.id)).embed).toMatchObject({ url: `${site}/antiga`, title: 'Notícia & fato' })
  })

  it('editar trocando o link troca a prévia; tirar o link tira a prévia', async () => {
    const ana = await user('Ana')
    const ch = await channel()
    const msg = await send(ana, ch.id, `${site}/noticia`)
    await embedOf(ana, msg.id)
    const changed = embedOf(ana, msg.id)
    expect(await ana.socket.emitWithAck('message:edit', { messageId: msg.id, content: `agora ${site}/outra` })).toEqual({ ok: true })
    expect((await changed).embed?.title).toBe('Outra página')
    const gone = embedOf(ana, msg.id)
    expect(await ana.socket.emitWithAck('message:edit', { messageId: msg.id, content: 'sem link' })).toEqual({ ok: true })
    expect((await gone).embed).toBeNull()
  })

  it('remover a prévia: só o autor; todos recebem embed null e o histórico fica sem', async () => {
    const ana = await user('Ana')
    const bia = await user('Bia')
    const ch = await channel()
    const msg = await send(ana, ch.id, `${site}/noticia`)
    await embedOf(bia, msg.id)
    expect(await bia.socket.emitWithAck('message:embed-remove', { messageId: msg.id })).toEqual({
      ok: false,
      error: 'Você só pode remover a prévia das suas mensagens'
    })
    expect(await bia.socket.emitWithAck('message:embed-remove', { messageId: 'nao-existe' })).toEqual({ ok: false, error: 'Mensagem não encontrada' })
    const removed = embedOf(bia, msg.id)
    expect(await ana.socket.emitWithAck('message:embed-remove', { messageId: msg.id })).toEqual({ ok: true })
    expect(await removed).toEqual({ channelId: ch.id, messageId: msg.id, embed: null })
    const history = await bia.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(history.messages.find((m) => m.id === msg.id)?.embed).toBeUndefined()
  })

  it('a imagem é baixada pelo servidor e servida só para quem vê o canal', async () => {
    const owner = await server.asOwner()
    const ana = await user('Ana')
    const ch = await channel()
    const msg = await send(owner, ch.id, `${site}/com-imagem`)
    const { embed } = await embedOf(ana, msg.id)
    expect(embed?.imageUrl).toMatch(new RegExp(`^/embeds/${msg.id}\\?`))
    expect(embed?.imageUrl).not.toContain('127.0.0.1')
    const res = await fetch(server.url + embed!.imageUrl)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG)
    expect((await fetch(server.url + `/embeds/${msg.id}`)).status).toBe(404)

    await owner.socket.emitWithAck('channel:set-overrides', { channelId: ch.id, overrides: [{ roleId: EVERYONE, allow: [], deny: ['view'] }] })
    expect((await fetch(server.url + embed!.imageUrl)).status).toBe(404)
    const history = await owner.socket.emitWithAck('message:history', { channelId: ch.id })
    expect((await fetch(server.url + history.messages[0].embed!.imageUrl!)).status).toBe(200)
  })
})
