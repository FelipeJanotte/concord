// @vitest-environment jsdom
// Componentes do chat com anexos: mensagem, campo de mensagem e área de soltar arquivos.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, Channel, Message } from '@shared/types'
import { ChatView } from '@/components/ChatView'
import { transport } from '@/lib/actions/uploads'
import { clearAllDrafts } from '@/lib/client'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { Composer } from './Composer'
import { fitImage, MessageAttachments } from './MessageAttachments'

const channel: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }

const image: Attachment = {
  id: 'img1',
  name: 'gato.png',
  size: 2048,
  contentType: 'image/png',
  url: '/files/img1/gato.png',
  width: 800,
  height: 600
}

const pdf: Attachment = {
  id: 'doc1',
  name: 'relatório.pdf',
  size: 1536,
  contentType: 'application/pdf',
  url: '/files/doc1/relat%C3%B3rio.pdf',
  width: null,
  height: null
}

let socket: FakeSocket
let resolveUpload: ((a: Attachment) => void) | null

beforeEach(() => {
  useApp.setState({ ...initialState, serverUrl: 'http://srv:3001', channels: [channel] })
  vi.stubGlobal('localStorage', { getItem: () => 'tok' })
  URL.createObjectURL = vi.fn(() => 'blob:prev')
  URL.revokeObjectURL = vi.fn()
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  resolveUpload = null
  vi.spyOn(transport, 'send').mockImplementation(() => new Promise<Attachment>((r) => (resolveUpload = r)))
})

afterEach(() => {
  cleanup()
  clearAllDrafts()
  setSocket(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('fitImage', () => {
  it('cabe em 400×300 mantendo a proporção e não aumenta imagem pequena', () => {
    expect(fitImage(800, 600)).toEqual({ width: 400, height: 300 })
    expect(fitImage(1000, 200)).toEqual({ width: 400, height: 80 })
    expect(fitImage(100, 1000)).toEqual({ width: 30, height: 300 })
    expect(fitImage(50, 40)).toEqual({ width: 50, height: 40 })
    expect(fitImage(null, 10)).toBeNull()
  })
})

describe('MessageAttachments', () => {
  it('imagem aparece no chat com o endereço do servidor e o espaço reservado', () => {
    render(<MessageAttachments attachments={[image]} />)
    const img = screen.getByRole('img', { name: 'gato.png' })
    expect(img.getAttribute('src')).toBe('http://srv:3001/files/img1/gato.png')
    expect(img.getAttribute('width')).toBe('400')
    expect(img.getAttribute('height')).toBe('300')
  })

  it('clicar na imagem abre a visualização ampliada', async () => {
    render(<MessageAttachments attachments={[image]} />)
    await userEvent.click(screen.getByTitle('gato.png'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('img', { name: 'gato.png' })).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: /Abrir original/ }).getAttribute('href')).toBe(
      'http://srv:3001/files/img1/gato.png'
    )
  })

  it('arquivo vira cartão com nome, tamanho e botão de baixar', () => {
    render(<MessageAttachments attachments={[pdf]} />)
    expect(screen.getByText('1,5 KB')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'relatório.pdf' })
    expect(link.getAttribute('href')).toBe('http://srv:3001/files/doc1/relat%C3%B3rio.pdf')
    expect(link.getAttribute('download')).toBe('relatório.pdf')
    expect(screen.getByRole('link', { name: 'Baixar relatório.pdf' })).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('sem anexos não desenha nada', () => {
    const { container } = render(<MessageAttachments attachments={[]} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('Composer', () => {
  it('Enter envia o texto e limpa o campo', async () => {
    render(<Composer channel={channel} />)
    const box = screen.getByPlaceholderText('Conversar em #geral')
    await userEvent.type(box, 'oi pessoal{Enter}')
    expect(socket.sent('message:send')).toEqual([[{ channelId: 'geral', content: 'oi pessoal' }]])
    expect((box as HTMLTextAreaElement).value).toBe('')
  })

  it('comando de música (/skip) vai para o bot da minha sala com este chat e limpa o campo quando dá certo', async () => {
    useApp.setState({ myVoiceChannelId: 'sala' })
    socket.replyTo('music:skip', () => ({ ok: true, state: { channelId: 'sala', nowPlaying: null, queue: [] } }))
    render(<Composer channel={channel} />)
    const box = screen.getByPlaceholderText('Conversar em #geral')
    await userEvent.type(box, '/skip {Enter}')
    expect(socket.sent('music:skip')).toEqual([[{ channelId: 'sala', textChannelId: 'geral' }]])
    expect(socket.sent('message:send')).toEqual([])
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''))
  })

  it('/play limpa o campo ao enviar, sem esperar a busca do bot', async () => {
    useApp.setState({ myVoiceChannelId: 'sala' })
    socket.replyTo('music:play', () => new Promise(() => {}))
    render(<Composer channel={channel} />)
    const box = screen.getByPlaceholderText('Conversar em #geral')
    await userEvent.type(box, '/play lofi{Enter}')
    expect(socket.sent('music:play')).toEqual([[{ channelId: 'sala', query: 'lofi', textChannelId: 'geral' }]])
    expect((box as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByTestId('command-block')).toBeNull()
  })

  it('comando de música recusado: o texto continua no campo para corrigir', async () => {
    useApp.setState({ myVoiceChannelId: 'sala' })
    socket.replyTo('music:play', () => ({ ok: false, error: 'Envie o nome da música ou um link do Spotify ou do YouTube' }))
    render(<Composer channel={channel} />)
    const box = screen.getByPlaceholderText('Conversar em #geral')
    await userEvent.type(box, '/play https://soundcloud.com/x{Enter}')
    await waitFor(() => expect(useApp.getState().notice?.text).toBe('Envie o nome da música ou um link do Spotify ou do YouTube'))
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe('https://soundcloud.com/x'))
    expect(within(screen.getByTestId('command-block')).getByText('/play')).toBeTruthy()
    expect(socket.sent('message:send')).toEqual([])
  })

  it('/play aparece como código; com o espaço vira o bloco "query"; no meio do texto, nada', async () => {
    render(<Composer channel={channel} />)
    const box = screen.getByPlaceholderText('Conversar em #geral') as HTMLTextAreaElement
    expect(screen.queryByTestId('command-highlight')).toBeNull()
    await userEvent.type(box, '/play')
    expect(screen.getByTestId('command-highlight').querySelector('code')?.textContent).toBe('/play')
    expect(screen.queryByTestId('command-block')).toBeNull()
    await userEvent.type(box, ' lofi')
    expect(within(screen.getByTestId('command-block')).getByText('query')).toBeTruthy()
    expect(box.value).toBe('lofi')
    expect(screen.queryByTestId('command-highlight')).toBeNull()
    await userEvent.clear(box)
    await userEvent.keyboard('{Backspace}')
    await userEvent.clear(box)
    await userEvent.type(box, 'oi /play')
    expect(screen.queryByTestId('command-highlight')).toBeNull()
    expect(screen.queryByTestId('command-block')).toBeNull()
  })

  it('/skip, /stop e /queue aparecem como código, sem a dica "query"', async () => {
    render(<Composer channel={channel} />)
    const box = screen.getByPlaceholderText('Conversar em #geral')
    for (const command of ['/skip', '/stop', '/queue']) {
      await userEvent.clear(box)
      await userEvent.type(box, command)
      expect(screen.getByTestId('command-highlight').querySelector('code')?.textContent).toBe(command)
      expect(screen.queryByText('query')).toBeNull()
    }
  })

  it('escolher arquivo mostra a prévia com progresso; enviar só depois de terminar', async () => {
    render(<Composer channel={channel} />)
    const input = screen.getByTestId('file-input') as HTMLInputElement
    await userEvent.upload(input, new File(['abc'], 'nota.txt', { type: 'text/plain' }))

    expect(screen.getByText('nota.txt')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Enviando nota.txt' })).toBeTruthy()
    const sendButton = screen.getByRole('button', { name: 'Enviar' }) as HTMLButtonElement
    expect(sendButton.disabled).toBe(true)

    await userEvent.type(screen.getByPlaceholderText('Conversar em #geral'), 'segue{Enter}')
    expect(socket.sent('message:send')).toEqual([]) // ainda subindo

    await act(async () => resolveUpload!({ ...pdf, id: 'up1', name: 'nota.txt' }))
    expect(sendButton.disabled).toBe(false)
    await userEvent.click(sendButton)
    expect(socket.sent('message:send')).toEqual([[{ channelId: 'geral', content: 'segue', attachmentIds: ['up1'] }]])
    expect(screen.queryByText('nota.txt')).toBeNull()
  })

  it('remover tira o anexo da prévia', async () => {
    render(<Composer channel={channel} />)
    await userEvent.upload(screen.getByTestId('file-input') as HTMLInputElement, new File(['x'], 'tira.txt'))
    await userEvent.click(screen.getByRole('button', { name: 'Remover tira.txt' }))
    expect(screen.queryByText('tira.txt')).toBeNull()
  })

  it('colar uma imagem adiciona como anexo; colar texto continua normal', () => {
    render(<Composer channel={channel} />)
    const box = screen.getByPlaceholderText('Conversar em #geral')
    const png = new File(['x'], 'print.png', { type: 'image/png' })
    fireEvent.paste(box, { clipboardData: { files: [png] } })
    expect(screen.getByText('print.png')).toBeTruthy()
    expect(transport.send).toHaveBeenCalledTimes(1)

    fireEvent.paste(box, { clipboardData: { files: [] } })
    expect(transport.send).toHaveBeenCalledTimes(1)
  })
})

describe('ChatView: arrastar e soltar', () => {
  const message: Message = {
    id: 'm1',
    channelId: 'geral',
    author: { id: 'u1', accountId: 'a1', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null },
    content: '',
    attachments: [image],
    createdAt: Date.now()
  }

  it('mostra a mensagem só com imagem (sem texto)', () => {
    useApp.setState({ messages: { geral: [message] }, hasMoreHistory: { geral: false } })
    render(<ChatView channelId="geral" />)
    expect(screen.getByRole('img', { name: 'gato.png' })).toBeTruthy()
  })

  it('arrastar arquivos mostra o aviso e soltar adiciona ao rascunho', () => {
    useApp.setState({ messages: { geral: [] }, hasMoreHistory: { geral: false } })
    render(<ChatView channelId="geral" />)
    const zone = screen.getByTestId('chat-drop-zone')
    const dropped = new File(['x'], 'solto.txt')
    const dataTransfer = { types: ['Files'], files: [dropped] }

    fireEvent.dragEnter(zone, { dataTransfer })
    expect(screen.getByText('Solte para enviar em #geral')).toBeTruthy()
    fireEvent.drop(zone, { dataTransfer })
    expect(screen.queryByText('Solte para enviar em #geral')).toBeNull()
    expect(useApp.getState().drafts.geral.map((u) => u.name)).toEqual(['solto.txt'])
  })

  it('arrastar texto (não arquivo) não mostra o aviso', () => {
    useApp.setState({ messages: { geral: [] }, hasMoreHistory: { geral: false } })
    render(<ChatView channelId="geral" />)
    fireEvent.dragEnter(screen.getByTestId('chat-drop-zone'), { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(screen.queryByText('Solte para enviar em #geral')).toBeNull()
  })
})
