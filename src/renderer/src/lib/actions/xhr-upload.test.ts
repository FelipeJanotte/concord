// O envio real (XMLHttpRequest): cabeçalhos, progresso, resposta, erro e cancelamento.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '@shared/types'
import { transport } from '@/lib/actions/uploads'

class FakeXhr {
  static last: FakeXhr
  method = ''
  url = ''
  headers: Record<string, string> = {}
  body: unknown
  status = 0
  responseText = ''
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null
  }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  aborted = false

  constructor() {
    FakeXhr.last = this
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value
  }
  send(body: unknown) {
    this.body = body
  }
  abort() {
    this.aborted = true
    this.onabort?.()
  }
  respond(status: number, body: unknown) {
    this.status = status
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body)
    this.onload?.()
  }
}

const attachment: Attachment = {
  id: 'a1',
  name: 'relatório final.pdf',
  size: 3,
  contentType: 'application/pdf',
  url: '/files/a1/x',
  width: null,
  height: null
}

function start(file = new File(['abc'], 'relatório final.pdf', { type: 'application/pdf' })) {
  const onProgress = vi.fn()
  const controller = new AbortController()
  const promise = transport.send({ serverUrl: 'http://srv:3001/', token: 'tok', file, onProgress, signal: controller.signal })
  return { promise, onProgress, controller, xhr: FakeXhr.last, file }
}

beforeEach(() => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('transport.send (XHR)', () => {
  it('faz POST /uploads com token, nome codificado, tipo e o arquivo como corpo', async () => {
    const { promise, xhr, file } = start()
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe('http://srv:3001/uploads')
    expect(xhr.headers).toEqual({
      authorization: 'Bearer tok',
      'x-file-name': encodeURIComponent('relatório final.pdf'),
      'content-type': 'application/pdf'
    })
    expect(xhr.body).toBe(file)
    xhr.respond(200, { ok: true, attachment })
    await expect(promise).resolves.toEqual(attachment)
  })

  it('arquivo sem tipo vai como octet-stream', () => {
    const { xhr } = start(new File(['x'], 'sem-tipo'))
    expect(xhr.headers['content-type']).toBe('application/octet-stream')
  })

  it('informa o progresso do envio', () => {
    const { xhr, onProgress } = start()
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 1, total: 4 })
    xhr.upload.onprogress!({ lengthComputable: false, loaded: 2, total: 0 })
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith(0.25)
  })

  it('erro do servidor vira a mensagem dele', async () => {
    const { promise, xhr } = start()
    xhr.respond(413, { ok: false, error: 'Arquivo maior que 25 MB' })
    await expect(promise).rejects.toThrow('Arquivo maior que 25 MB')
  })

  it('resposta sem JSON vira erro com o código', async () => {
    const { promise, xhr } = start()
    xhr.respond(502, '<html>Bad Gateway</html>')
    await expect(promise).rejects.toThrow('Falha no envio (502)')
  })

  it('falha de rede', async () => {
    const { promise, xhr } = start()
    xhr.onerror!()
    await expect(promise).rejects.toThrow('Falha de conexão no envio')
  })

  it('cancelar aborta o XHR', async () => {
    const { promise, xhr, controller } = start()
    controller.abort()
    expect(xhr.aborted).toBe(true)
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })
})
