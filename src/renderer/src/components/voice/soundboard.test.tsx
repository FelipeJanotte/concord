// @vitest-environment jsdom
// Soundboard na tela (B17): grade (tocar, bloqueios, erro), apagar só para quem pode, enviar um som
// (prévia, nome sugerido, recusa local) e o indicador "fulano tocou X".
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessState, Sound, User } from '@shared/types'
import { soundTransport } from '@/lib/actions/sounds'
import { setSocket, TOKEN_KEY } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { Soundboard, SoundsPlayingBar } from './Soundboard'

const me: User = { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null }
const sound = (id: string, name: string, uploaderId: string | null, emoji: string | null = null): Sound => ({
  id,
  name,
  emoji,
  durationMs: 2000,
  uploaderId,
  url: `/sounds/${id}`
})
const meu = sound('s1', 'Buzina', 'acc-eu', '📯')
const daAna = sound('s2', 'Risada', 'acc-ana')
/** @todos com as permissões comuns, sem manageMessages; a dona é outra conta */
const basicAccess = {
  ownerAccountId: 'acc-dona',
  roles: [{ id: '00000000-0000-0000-0000-000000000000', name: '@todos', color: null, position: 0, permissions: ['view', 'send', 'connect', 'speak'] }],
  members: [],
  overrides: []
} as unknown as AccessState

let socket: FakeSocket

function setup(over: Partial<ReturnType<typeof useApp.getState>> = {}): void {
  useApp.setState({
    ...initialState,
    self: me,
    serverUrl: 'http://srv',
    access: basicAccess,
    sounds: [meu, daAna],
    soundsLoaded: true,
    soundboardOpen: true,
    myVoiceChannelId: 'sala',
    ...over
  })
}

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  socket.replyTo('sound:list', () => useApp.getState().sounds)
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('grade de sons', () => {
  it('clicar toca para a minha sala', async () => {
    setup()
    socket.replyTo('sound:play', () => ({ ok: true }))
    render(<Soundboard />)
    const list = screen.getByRole('list', { name: 'Sons' })
    expect(within(list).getAllByRole('button', { name: /^Tocar/ }).map((b) => b.textContent)).toEqual(['📯Buzina', 'Risada'])
    await userEvent.click(screen.getByRole('button', { name: 'Tocar Risada' }))
    expect(socket.sent('sound:play')[0][0]).toEqual({ channelId: 'sala', soundId: 's2' })
  })

  it('erro do servidor aparece na janela', async () => {
    setup()
    socket.replyTo('sound:play', () => ({ ok: false, error: 'Espere o som anterior terminar' }))
    render(<Soundboard />)
    await userEvent.click(screen.getByRole('button', { name: 'Tocar Buzina' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Espere o som anterior terminar')
  })

  it('fora da sala ou sem poder falar: explica e não deixa tocar', () => {
    setup({ myVoiceChannelId: null })
    render(<Soundboard />)
    expect(screen.getByText('Entre numa sala de voz para tocar sons.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tocar Buzina' })).toHaveProperty('disabled', true)
    cleanup()
    setup({ voiceCanSpeak: false })
    render(<Soundboard />)
    expect(screen.getByText(/não pode falar nesta sala/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tocar Risada' })).toHaveProperty('disabled', true)
  })

  it('coleção vazia convida a enviar', () => {
    setup({ sounds: [] })
    render(<Soundboard />)
    expect(screen.getByText('Nenhum som ainda. Envie o primeiro!')).toBeTruthy()
  })

  it('apagar: só o meu (sem manageMessages), com confirmação', async () => {
    setup()
    socket.replyTo('sound:delete', () => ({ ok: true }))
    render(<Soundboard />)
    expect(screen.queryByRole('button', { name: 'Apagar Risada' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Apagar Buzina' }))
    expect(socket.sent('sound:delete')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(socket.sent('sound:delete')[0][0]).toBe('s1')
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Tocar Buzina' })).toBeNull())
  })

  it('quem gerencia mensagens pode apagar o de outra pessoa', () => {
    const access = { ...basicAccess, roles: [{ ...basicAccess.roles[0], permissions: [...basicAccess.roles[0].permissions, 'manageMessages'] }] } as AccessState
    setup({ access })
    render(<Soundboard />)
    expect(screen.getByRole('button', { name: 'Apagar Risada' })).toBeTruthy()
  })
})

describe('enviar um som', () => {
  const pick = (file: File): void => {
    fireEvent.change(screen.getByLabelText(/Arquivo/), { target: { files: [file] } })
  }

  it('escolher o arquivo mostra a prévia e sugere o nome; enviar volta para a grade', async () => {
    setup()
    localStorage.setItem(TOKEN_KEY, 'tok')
    vi.spyOn(soundTransport, 'duration').mockResolvedValue(3000)
    const send = vi.spyOn(soundTransport, 'send').mockResolvedValue(sound('s9', 'air horn', 'acc-eu', '📢'))
    render(<Soundboard />)
    await userEvent.click(screen.getByRole('button', { name: 'Enviar um som' }))
    pick(new File([new Uint8Array(100)], 'air_horn.ogg', { type: 'audio/ogg' }))
    expect(await screen.findByLabelText('Prévia do som')).toBeTruthy()
    expect(screen.getByLabelText('Nome')).toHaveProperty('value', 'air horn')
    await userEvent.type(screen.getByLabelText('Emoji'), '📢')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ name: 'air horn', emoji: '📢', token: 'tok' }))
    expect(await screen.findByRole('button', { name: 'Tocar air horn' })).toBeTruthy()
  })

  it('arquivo longo demais: avisa e não deixa enviar', async () => {
    setup()
    vi.spyOn(soundTransport, 'duration').mockResolvedValue(8000)
    render(<Soundboard />)
    await userEvent.click(screen.getByRole('button', { name: 'Enviar um som' }))
    pick(new File([new Uint8Array(100)], 'longo.mp3', { type: 'audio/mpeg' }))
    expect((await screen.findByRole('alert')).textContent).toBe('O som pode ter no máximo 5 segundos')
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveProperty('disabled', true)
  })

  it('erro do servidor aparece no formulário', async () => {
    setup()
    localStorage.setItem(TOKEN_KEY, 'tok')
    vi.spyOn(soundTransport, 'duration').mockResolvedValue(3000)
    vi.spyOn(soundTransport, 'send').mockRejectedValue(new Error('Já existe um som com esse nome'))
    render(<Soundboard />)
    await userEvent.click(screen.getByRole('button', { name: 'Enviar um som' }))
    pick(new File([new Uint8Array(100)], 'Buzina.wav', { type: 'audio/wav' }))
    await screen.findByLabelText('Prévia do som')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Já existe um som com esse nome')
  })
})

describe('indicador', () => {
  it('mostra quem tocou o quê enquanto toca', () => {
    setup({ soundsPlaying: { 'acc-ana': { soundId: 's1', by: 'Ana', until: Date.now() + 2000 } } })
    render(<SoundsPlayingBar />)
    expect(screen.getByRole('status').textContent).toBe('📯 Ana tocou Buzina')
  })

  it('nada tocando: não aparece', () => {
    setup()
    render(<SoundsPlayingBar />)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
