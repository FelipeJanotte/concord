// Anexos de ponta a ponta: POST /uploads → message:send com attachmentIds → GET /files.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Attachment, Channel } from '../../src/shared/types'
import { expectNoEvent, sleep, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

let server: TestServer
const open: ClientSocket[] = []

beforeAll(async () => {
  server = await TestServer.start()
})

afterEach(() => {
  for (const s of open.splice(0)) s.close()
})

afterAll(async () => {
  await server?.destroy()
})

async function user(): Promise<TestUser> {
  const u = await server.newUser()
  open.push(u.socket)
  return u
}

/** Canal novo, criado pela dona (só quem tem manageChannels cria). */
async function textChannel(_u: TestUser): Promise<Channel> {
  return server.createChannel(`anexos-${randomUUID().slice(0, 8)}`)
}

async function uploadOk(u: TestUser, data: Uint8Array | string, opts?: { name?: string; type?: string }): Promise<Attachment> {
  const { status, body } = await server.upload(u.token, data, opts)
  if (status !== 200 || !body.ok) throw new Error(`upload falhou: ${status} ${JSON.stringify(body)}`)
  return body.attachment
}

describe('POST /uploads', () => {
  it('o preflight de CORS libera os cabeçalhos que o app usa no envio', async () => {
    const res = await fetch(server.url + '/uploads', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type,x-file-name'
      }
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
    const allowed = (res.headers.get('access-control-allow-headers') ?? '').split(',').map((h) => h.trim())
    expect(allowed).toEqual(expect.arrayContaining(['authorization', 'content-type', 'x-file-name']))
  })

  it('guarda a imagem, confirma o tipo pelos bytes e lê as dimensões', async () => {
    const u = await user()
    const a = await uploadOk(u, PNG_1PX, { name: 'foto do gato.png', type: 'image/png' })
    expect(a).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: 'foto do gato.png',
      size: PNG_1PX.length,
      contentType: 'image/png',
      url: `/files/${a.id}/${encodeURIComponent('foto do gato.png')}`,
      width: 1,
      height: 1
    })
    expect(existsSync(join(server.dataDir, 'uploads', a.id))).toBe(true)
  })

  it('arquivo que diz ser imagem mas não é vira octet-stream (sem dimensões)', async () => {
    const u = await user()
    const a = await uploadOk(u, '<script>alert(1)</script>', { name: 'falso.png', type: 'image/png' })
    expect(a).toMatchObject({ contentType: 'application/octet-stream', width: null, height: null })
  })

  it('arquivo comum guarda o tipo informado só para exibir', async () => {
    const u = await user()
    const a = await uploadOk(u, '%PDF-1.7 ...', { name: 'doc.pdf', type: 'application/pdf' })
    expect(a.contentType).toBe('application/pdf')
  })

  it('exige sessão válida', async () => {
    expect((await server.upload(null, 'x')).status).toBe(401)
    expect((await server.upload('token-falso', 'x')).status).toBe(401)
  })

  it('recusa arquivo vazio', async () => {
    const u = await user()
    expect(await server.upload(u.token, '')).toEqual({ status: 400, body: { ok: false, error: 'O arquivo está vazio' } })
  })

  it('aceita exatamente 25 MB e recusa 1 byte a mais', async () => {
    const u = await user()
    const max = 25 * 1024 * 1024
    const ok = await server.upload(u.token, new Uint8Array(max), { name: 'grande.bin' })
    expect(ok.status).toBe(200)
    const tooBig = await server.upload(u.token, new Uint8Array(max + 1), { name: 'demais.bin' })
    expect(tooBig).toEqual({ status: 413, body: { ok: false, error: 'Arquivo maior que 25 MB' } })
  })

  it('recusa 25 MB+ também quando o tamanho não vem no cabeçalho (envio em pedaços)', async () => {
    const u = await user()
    const chunk = new Uint8Array(1024 * 1024)
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 26) return controller.close()
        sent++
        controller.enqueue(chunk)
      }
    })
    const res = await fetch(server.url + '/uploads', {
      method: 'POST',
      headers: { authorization: `Bearer ${u.token}`, 'x-file-name': 'stream.bin' },
      body,
      duplex: 'half'
    } as RequestInit)
    expect(res.status).toBe(413)
    // nada sobrou em disco além do que já existia
    const files = await import('node:fs').then((fs) => fs.readdirSync(join(server.dataDir, 'uploads')))
    expect(files.some((f) => f.endsWith('.part'))).toBe(false)
  })

  it('limpa o nome do arquivo', async () => {
    const u = await user()
    const a = await uploadOk(u, 'x', { name: '../../segredo.txt' })
    expect(a.name).toBe('segredo.txt')
  })
})

describe('mensagens com anexos', () => {
  it('envia texto + anexos em ordem; todos recebem e o histórico guarda', async () => {
    const a = await user()
    const b = await user()
    const ch = await textChannel(a)
    const img = await uploadOk(a, PNG_1PX, { name: 'a.png' })
    const doc = await uploadOk(a, 'conteúdo', { name: 'b.txt', type: 'text/plain' })

    const got = waitFor(b.socket, 'message:new', (m) => m.channelId === ch.id)
    a.socket.emit('message:send', { channelId: ch.id, content: 'olha', attachmentIds: [doc.id, img.id] })
    const [msg] = await got
    expect(msg.content).toBe('olha')
    // mesmos anexos, na ordem; o link vem assinado para quem recebe
    const signed = (x: Attachment) => ({ ...x, url: expect.stringMatching(new RegExp(`^${x.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\?a=`)) })
    expect(msg.attachments).toEqual([signed(doc), signed(img)])

    const page = await b.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(page.messages[0].attachments).toEqual([signed(doc), signed(img)])
  })

  it('mensagem só com anexo (sem texto) é aceita', async () => {
    const a = await user()
    const ch = await textChannel(a)
    const img = await uploadOk(a, PNG_1PX)
    const got = waitFor(a.socket, 'message:new', (m) => m.channelId === ch.id)
    a.socket.emit('message:send', { channelId: ch.id, content: '   ', attachmentIds: [img.id] })
    expect((await got)[0]).toMatchObject({ content: '', attachments: [{ ...img, url: expect.stringContaining(`${img.url}?a=`) }] })
  })

  it('recusa anexo de outra pessoa, anexo já usado, repetido, inválido ou demais', async () => {
    const a = await user()
    const b = await user()
    const ch = await textChannel(a)
    const fromB = await uploadOk(b, 'de b')
    const mine = await uploadOk(a, 'meu')
    const used = await uploadOk(a, 'usado')
    const sentUsed = waitFor(a.socket, 'message:new', (m) => m.attachments.some((x) => x.id === used.id))
    a.socket.emit('message:send', { channelId: ch.id, content: '', attachmentIds: [used.id] })
    await sentUsed

    const silent = expectNoEvent(a.socket, 'message:new', (m) => m.channelId === ch.id, 600)
    a.socket.emit('message:send', { channelId: ch.id, content: 'roubando', attachmentIds: [fromB.id] })
    a.socket.emit('message:send', { channelId: ch.id, content: 'de novo', attachmentIds: [used.id] })
    a.socket.emit('message:send', { channelId: ch.id, content: 'dobrado', attachmentIds: [mine.id, mine.id] })
    a.socket.emit('message:send', { channelId: ch.id, content: 'lixo', attachmentIds: ['nao-uuid'] })
    a.socket.emit('message:send', { channelId: ch.id, content: 'muitos', attachmentIds: Array.from({ length: 11 }, () => randomUUID()) })
    a.socket.emit('message:send', { channelId: ch.id, content: 'mistura', attachmentIds: [mine.id, fromB.id] })
    await silent

    // a tentativa "mistura" não prendeu o `mine` (tudo ou nada): ele continua livre para usar
    const ok = waitFor(a.socket, 'message:new', (m) => m.attachments.some((x) => x.id === mine.id))
    a.socket.emit('message:send', { channelId: ch.id, content: 'agora sim', attachmentIds: [mine.id] })
    await ok
  })

  it('sem texto e sem anexo continua sendo ignorada', async () => {
    const a = await user()
    const ch = await textChannel(a)
    const silent = expectNoEvent(a.socket, 'message:new', (m) => m.channelId === ch.id)
    a.socket.emit('message:send', { channelId: ch.id, content: '', attachmentIds: [] })
    await silent
  })
})

describe('GET /files', () => {
  /** Publica o anexo e devolve como o autor o recebe no message:new (com o link assinado para ele). */
  async function published(u: TestUser, data: Uint8Array | string, opts: { name: string; type?: string }): Promise<Attachment> {
    const ch = await textChannel(u)
    const att = await uploadOk(u, data, opts)
    const got = waitFor(u.socket, 'message:new', (m) => m.attachments.some((x) => x.id === att.id))
    u.socket.emit('message:send', { channelId: ch.id, content: '', attachmentIds: [att.id] })
    const [msg] = await got
    return msg.attachments.find((x) => x.id === att.id)!
  }

  it('o link vem assinado para cada pessoa; sem assinatura, adulterado ou de outro anexo: 404', async () => {
    const a = await user()
    const b = await user()
    const ch = await textChannel(a)
    const att = await uploadOk(a, PNG_1PX, { name: 'assinado.png' })
    const forA = waitFor(a.socket, 'message:new', (m) => m.attachments.some((x) => x.id === att.id))
    const forB = waitFor(b.socket, 'message:new', (m) => m.attachments.some((x) => x.id === att.id))
    a.socket.emit('message:send', { channelId: ch.id, content: '', attachmentIds: [att.id] })
    const urlA = (await forA)[0].attachments[0].url
    const urlB = (await forB)[0].attachments[0].url
    expect(urlA).toMatch(new RegExp(`^/files/${att.id}/assinado\\.png\\?a=${a.account.id}&e=\\d+&s=`))
    expect(urlB).toContain(`a=${b.account.id}`)
    expect(urlA).not.toBe(urlB)
    expect((await fetch(server.url + urlA)).status).toBe(200)
    expect((await fetch(server.url + urlB)).status).toBe(200)

    expect((await fetch(server.url + att.url)).status).toBe(404) // sem assinatura
    expect((await fetch(server.url + urlA.replace(/s=[^&]+/, 's=falsa'))).status).toBe(404)
    expect((await fetch(server.url + urlA.replace(`a=${a.account.id}`, `a=${b.account.id}`))).status).toBe(404)
    const other = await uploadOk(a, 'outro')
    expect((await fetch(server.url + urlA.replace(att.id, other.id))).status).toBe(404)

    // o histórico também entrega links assinados para quem pede
    const page = await b.socket.emitWithAck('message:history', { channelId: ch.id })
    expect(page.messages[0].attachments[0].url).toContain(`a=${b.account.id}`)
  })

  it('serve imagem confirmada inline com o tipo certo e cabeçalhos de segurança', async () => {
    const u = await user()
    const att = await published(u, PNG_1PX, { name: 'img.png' })
    const res = await fetch(server.url + att.url)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('content-disposition')).toBe(`inline; filename*=UTF-8''img.png`)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG_1PX)
  })

  it('HTML/SVG nunca é servido para rodar: vai como download octet-stream', async () => {
    const u = await user()
    const att = await published(u, '<svg onload="alert(1)"/>', { name: 'x.svg', type: 'image/svg+xml' })
    const res = await fetch(server.url + att.url)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename*=UTF-8''x.svg`)
  })

  it('nome com acento e espaço vai codificado no download', async () => {
    const u = await user()
    const att = await published(u, 'x', { name: 'relatório final.txt' })
    const res = await fetch(server.url + att.url)
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename*=UTF-8''${encodeURIComponent('relatório final.txt')}`
    )
  })

  it('anexo que ainda não está em mensagem, inexistente ou id inválido: 404', async () => {
    const u = await user()
    const loose = await uploadOk(u, 'solto')
    expect((await fetch(server.url + loose.url)).status).toBe(404)
    expect((await fetch(`${server.url}/files/${randomUUID()}/x`)).status).toBe(404)
    expect((await fetch(`${server.url}/files/..%2F..%2Fdb.json/x`)).status).toBe(404)
  })

  it('apagar o canal apaga os arquivos do disco', async () => {
    const u = await user()
    const ch = await textChannel(u)
    const att = await uploadOk(u, 'vai sumir')
    const got = waitFor(u.socket, 'message:new', (m) => m.attachments.some((x) => x.id === att.id))
    u.socket.emit('message:send', { channelId: ch.id, content: '', attachmentIds: [att.id] })
    await got
    const file = join(server.dataDir, 'uploads', att.id)
    expect(existsSync(file)).toBe(true)

    const deleted = waitFor(u.socket, 'channel:deleted', (id) => id === ch.id)
    ;(await server.asOwner()).socket.emit('channel:delete', ch.id)
    await deleted
    await sleep(100)
    expect(existsSync(file)).toBe(false)
    expect((await fetch(server.url + att.url)).status).toBe(404)
  })
})

describe('limpeza', () => {
  let fast: TestServer
  const orphan = randomUUID()

  beforeAll(async () => {
    fast = await TestServer.start({
      env: { UPLOAD_ORPHAN_TTL_MS: '400', UPLOAD_SWEEP_INTERVAL_MS: '200' },
      // arquivo "perdido" (sem registro no banco), como depois de uma queda no meio do envio
      prepare: (dataDir) => {
        mkdirSync(join(dataDir, 'uploads'), { recursive: true })
        writeFileSync(join(dataDir, 'uploads', orphan), 'perdido')
      }
    })
  })

  afterAll(async () => {
    await fast?.destroy()
  })

  it('no boot apaga arquivos sem registro no banco', () => {
    expect(existsSync(join(fast.dataDir, 'uploads', orphan))).toBe(false)
    expect(fast.log).toMatch(/\[uploads\] 1 arquivo\(s\) sem registro apagado\(s\)/)
  })

  it('anexo enviado e nunca usado é apagado depois do prazo; o usado fica', async () => {
    const u = await fast.newUser()
    open.push(u.socket)
    const ch = u.state.channels.find((c) => c.name === 'geral')!
    const unused = await fast.upload(u.token, 'esquecido')
    const used = await fast.upload(u.token, 'usado')
    if (!unused.body.ok || !used.body.ok) throw new Error('upload falhou')
    const usedId = used.body.attachment.id
    const got = waitFor(u.socket, 'message:new', (m) => m.attachments.some((x) => x.id === usedId))
    u.socket.emit('message:send', { channelId: ch.id, content: '', attachmentIds: [usedId] })
    await got

    const unusedFile = join(fast.dataDir, 'uploads', unused.body.attachment.id)
    const deadline = Date.now() + 5000
    while (existsSync(unusedFile) && Date.now() < deadline) await sleep(100)
    expect(existsSync(unusedFile)).toBe(false)
    expect(existsSync(join(fast.dataDir, 'uploads', usedId))).toBe(true)

    // e não dá mais para usar o anexo apagado
    const silent = expectNoEvent(u.socket, 'message:new', (m) => m.channelId === ch.id)
    u.socket.emit('message:send', { channelId: ch.id, content: 'tarde demais', attachmentIds: [unused.body.attachment.id] })
    await silent
  })
})
