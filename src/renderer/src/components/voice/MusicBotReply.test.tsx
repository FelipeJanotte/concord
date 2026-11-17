// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { toolResultText, type Channel, type Message, type MusicBotReply, type ToolPayload } from '@shared/types'
import { ChatView } from '@/components/ChatView'
import { bindMessageEvents } from '@/lib/actions/messages'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const channel: Channel = { id: 'geral', name: 'geral', type: 'text', createdAt: 0 }
const ana = { id: 'acc-ana', accountId: 'acc-ana', name: 'Ana', tag: '0001', color: '#fff', avatarUrl: null }
const ipanema = { title: 'Garota de Ipanema', artists: ['Tom Jobim'], coverUrl: 'https://i.scdn.co/capa.jpg' }
const aguas = { title: 'Águas de Março', artists: ['Elis Regina'], coverUrl: null }

const said = (content: string, createdAt = 1000): Message => ({
  id: `m-${createdAt}`,
  channelId: 'geral',
  author: ana,
  content,
  attachments: [],
  createdAt
})

function botReply(reply: MusicBotReply, createdAt = 1001): Message {
  const tool: ToolPayload = { tool: 'music', result: reply }
  return { ...said(toolResultText(tool), createdAt), kind: 'tool', tool }
}

function show(messages: Message[]): void {
  useApp.setState({ messages: { geral: messages }, hasMoreHistory: { geral: false } })
  render(<ChatView channelId="geral" />)
}

const card = (): HTMLElement => screen.getByRole('region', { name: 'Resposta do bot de música' })

beforeEach(() => {
  useApp.setState({ ...initialState, channels: [channel] })
  setSocket(new FakeSocket().asSocket())
})

afterEach(() => {
  cleanup()
  setSocket(null)
})

describe('resposta do bot de música no chat', () => {
  it('aparece como "Música" com selo BOT logo depois do comando da pessoa, sem se juntar a ela', () => {
    show([said('/play ipanema'), botReply({ action: 'play', added: 1, startedNow: true, first: ipanema })])
    expect(screen.getByText('/play ipanema')).toBeTruthy()
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(screen.getByText('Música')).toBeTruthy()
    expect(screen.getByText('BOT')).toBeTruthy()
    expect(within(card()).getByText('Tocando agora')).toBeTruthy()
    expect(within(card()).getByText('Garota de Ipanema')).toBeTruthy()
    expect(within(card()).getByText('Tom Jobim')).toBeTruthy()
    expect(within(card()).getByAltText('Capa de Garota de Ipanema')).toBeTruthy()
    expect(within(card()).getByText('Pedido por Ana')).toBeTruthy()
  })

  it('entrou na fila e playlist', () => {
    show([botReply({ action: 'play', added: 1, startedNow: false, first: aguas })])
    expect(within(card()).getByText('Adicionou à fila')).toBeTruthy()
    cleanup()
    show([botReply({ action: 'play', added: 12, startedNow: false, first: aguas })])
    expect(within(card()).getByText('Adicionou 12 músicas à fila, começando por')).toBeTruthy()
    expect(within(card()).getByText('Águas de Março')).toBeTruthy()
  })

  it('procurando: mostra a busca com o indicador; a resposta chega e troca o cartão no lugar', () => {
    const socket = new FakeSocket()
    setSocket(socket.asSocket())
    bindMessageEvents(socket.asSocket())
    const searching = botReply({ action: 'searching', query: 'garota de ipanema' })
    show([said('/play garota de ipanema'), searching])
    expect(within(card()).getByText('Procurando “garota de ipanema”…')).toBeTruthy()
    expect(within(card()).getByRole('status', { name: 'Procurando' })).toBeTruthy()
    const tool: ToolPayload = { tool: 'music', result: { action: 'play', added: 1, startedNow: true, first: ipanema } }
    act(() => socket.receive('message:edited', { channelId: 'geral', messageId: searching.id, content: toolResultText(tool), tool }))
    expect(within(card()).getByText('Tocando agora')).toBeTruthy()
    expect(within(card()).getByText('Garota de Ipanema')).toBeTruthy()
    expect(within(card()).queryByRole('status')).toBeNull()
    expect(screen.queryByText('(editada)')).toBeNull()
  })

  it('erro: "Não consegui tocar" com o motivo, na cor de erro', () => {
    show([botReply({ action: 'failed', query: 'xyz', error: 'Nada encontrado no YouTube para "xyz"' })])
    const error = within(card()).getByText('Não consegui tocar: Nada encontrado no YouTube para "xyz"')
    expect(error.className).toContain('text-destructive')
    expect(within(card()).queryByRole('status')).toBeNull()
  })

  it('pulou (com a próxima) e parou', () => {
    show([botReply({ action: 'skip', skipped: ipanema, next: aguas })])
    expect(within(card()).getByText('Pulou')).toBeTruthy()
    expect(within(card()).getByText('Garota de Ipanema')).toBeTruthy()
    expect(within(card()).getByText('Tocando agora: Águas de Março — Elis Regina')).toBeTruthy()
    cleanup()
    show([botReply({ action: 'stop' })])
    expect(within(card()).getByText('Parou a música e limpou a fila')).toBeTruthy()
  })
})
