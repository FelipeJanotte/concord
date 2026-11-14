// Anexos no rascunho: validação, progresso, cancelamento e envio junto com a mensagem.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '@shared/types'
import { bindChannelEvents } from '@/lib/actions/channels'
import { sendMessage } from '@/lib/actions/messages'
import {
  addFiles,
  clearAllDrafts,
  isUploading,
  readyAttachmentIds,
  removePendingUpload,
  transport,
  type SendArgs
} from '@/lib/actions/uploads'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

interface Pending {
  args: SendArgs
  resolve: (a: Attachment) => void
  reject: (e: Error) => void
}

let socket: FakeSocket
let sends: Pending[]

const file = (name: string, size = 10, type = 'text/plain'): File => new File([new Uint8Array(size)], name, { type })

const attachment = (id: string, name = `${id}.txt`): Attachment => ({
  id,
  name,
  size: 10,
  contentType: 'text/plain',
  url: `/files/${id}/${name}`,
  width: null,
  height: null
})

const draft = (channelId = 'geral') => useApp.getState().drafts[channelId] ?? []

beforeEach(() => {
  useApp.setState({ ...initialState, serverUrl: 'http://servidor:3001' })
  vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'concord:token' ? 'token-123' : null) })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:prev'), revokeObjectURL: vi.fn() }))
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  sends = []
  vi.spyOn(transport, 'send').mockImplementation(
    (args) => new Promise<Attachment>((resolve, reject) => sends.push({ args, resolve, reject }))
  )
})

afterEach(() => {
  clearAllDrafts()
  setSocket(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('addFiles', () => {
  it('cria o rascunho e envia com servidor, token e arquivo', () => {
    const f = file('doc.txt')
    addFiles('geral', [f])
    expect(draft()).toMatchObject([{ name: 'doc.txt', size: 10, status: 'uploading', progress: 0, previewUrl: null }])
    expect(sends).toHaveLength(1)
    expect(sends[0].args).toMatchObject({ serverUrl: 'http://servidor:3001', token: 'token-123', file: f })
  })

  it('imagem ganha miniatura local (blob:)', () => {
    addFiles('geral', [file('foto.png', 10, 'image/png')])
    expect(draft()[0].previewUrl).toBe('blob:prev')
  })

  it('atualiza o progresso e marca como pronto com o anexo do servidor', async () => {
    addFiles('geral', [file('a.txt')])
    sends[0].args.onProgress(0.5)
    expect(draft()[0].progress).toBe(0.5)
    expect(isUploading('geral')).toBe(true)
    sends[0].resolve(attachment('id-a'))
    await flush()
    expect(draft()[0]).toMatchObject({ status: 'done', progress: 1, attachment: attachment('id-a') })
    expect(isUploading('geral')).toBe(false)
    expect(readyAttachmentIds('geral')).toEqual(['id-a'])
  })

  it('erro do servidor aparece no anexo', async () => {
    addFiles('geral', [file('a.txt')])
    sends[0].reject(new Error('Arquivo maior que 25 MB'))
    await flush()
    expect(draft()[0]).toMatchObject({ status: 'error', error: 'Arquivo maior que 25 MB' })
  })

  it('recusa vazio e acima de 25 MB com aviso, sem enviar', () => {
    addFiles('geral', [file('vazio.txt', 0)])
    expect(useApp.getState().notice?.text).toBe('"vazio.txt" está vazio')
    addFiles('geral', [{ name: 'enorme.iso', size: 25 * 1024 * 1024 + 1, type: '' } as File])
    expect(useApp.getState().notice?.text).toBe('"enorme.iso" é maior que 25 MB')
    expect(sends).toHaveLength(0)
    expect(draft()).toEqual([])
  })

  it('no máximo 10 anexos por mensagem (contando os que já estão no rascunho)', () => {
    addFiles('geral', Array.from({ length: 7 }, (_, i) => file(`a${i}.txt`)))
    addFiles('geral', Array.from({ length: 5 }, (_, i) => file(`b${i}.txt`)))
    expect(draft()).toHaveLength(10)
    expect(useApp.getState().notice?.text).toBe('Até 10 anexos por mensagem')
  })

  it('sem sessão não envia', () => {
    useApp.setState({ serverUrl: null })
    addFiles('geral', [file('a.txt')])
    expect(sends).toHaveLength(0)
    expect(useApp.getState().notice?.text).toBe('Sem conexão com o servidor')
  })

  it('rascunhos são por canal', () => {
    addFiles('geral', [file('a.txt')])
    addFiles('outro', [file('b.txt')])
    expect(draft('geral').map((u) => u.name)).toEqual(['a.txt'])
    expect(draft('outro').map((u) => u.name)).toEqual(['b.txt'])
  })
})

describe('removePendingUpload', () => {
  it('cancela o envio em andamento, libera a miniatura e não marca erro', async () => {
    addFiles('geral', [file('foto.png', 10, 'image/png')])
    const { localId } = draft()[0]
    removePendingUpload('geral', localId)
    expect(sends[0].args.signal.aborted).toBe(true)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:prev')
    sends[0].reject(new DOMException('cancelado', 'AbortError'))
    await flush()
    expect(draft()).toEqual([])
  })
})

describe('sendMessage com anexos', () => {
  it('manda os ids prontos na ordem e esvazia o rascunho', async () => {
    addFiles('geral', [file('a.txt'), file('b.txt')])
    sends[1].resolve(attachment('id-b'))
    sends[0].resolve(attachment('id-a'))
    await flush()
    expect(sendMessage('geral', '  veja  ')).toBe(true)
    expect(socket.sent('message:send')).toEqual([[{ channelId: 'geral', content: 'veja', attachmentIds: ['id-a', 'id-b'] }]])
    expect(draft()).toEqual([])
  })

  it('só anexo, sem texto, também envia', async () => {
    addFiles('geral', [file('a.txt')])
    sends[0].resolve(attachment('id-a'))
    await flush()
    expect(sendMessage('geral', '')).toBe(true)
    expect(socket.sent('message:send')).toEqual([[{ channelId: 'geral', content: '', attachmentIds: ['id-a'] }]])
  })

  it('espera os anexos terminarem de subir', () => {
    addFiles('geral', [file('a.txt')])
    expect(sendMessage('geral', 'texto')).toBe(false)
    expect(socket.sent('message:send')).toEqual([])
    expect(draft()).toHaveLength(1)
  })

  it('anexo com erro é ignorado (vai só o texto)', async () => {
    addFiles('geral', [file('a.txt')])
    sends[0].reject(new Error('falhou'))
    await flush()
    expect(sendMessage('geral', 'só texto')).toBe(true)
    expect(socket.sent('message:send')).toEqual([[{ channelId: 'geral', content: 'só texto' }]])
  })

  it('sem texto e sem anexo pronto não envia', () => {
    expect(sendMessage('geral', '   ')).toBe(false)
    expect(socket.sent('message:send')).toEqual([])
  })
})

describe('canal apagado', () => {
  it('descarta o rascunho e cancela os envios daquele canal', () => {
    bindChannelEvents(socket.asSocket())
    useApp.setState({ channels: [{ id: 'geral', name: 'geral', type: 'text', createdAt: 0 }] })
    socket.replyTo('message:history', () => ({ messages: [], hasMore: false }))
    addFiles('geral', [file('a.txt')])
    socket.receive('channel:deleted', 'geral')
    expect(draft()).toEqual([])
    expect(sends[0].args.signal.aborted).toBe(true)
  })
})
