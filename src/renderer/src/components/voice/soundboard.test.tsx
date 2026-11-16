// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanSoundEmoji, type AccessState, type Sound, type User } from '@shared/types'
import { soundTransport } from '@/lib/actions/sounds'
import { setSocket, TOKEN_KEY } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { EMOJI_GROUPS, EmojiPicker } from './EmojiPicker'
import { SoundboardPopover, SoundsPlayingBar } from './Soundboard'

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
const basicAccess = {
  ownerAccountId: 'acc-dona',
  roles: [{ id: '00000000-0000-0000-0000-000000000000', name: '@todos', color: null, position: 0, permissions: ['view', 'send', 'connect', 'speak'] }],
  members: [],
  overrides: []
} as unknown as AccessState

let socket: FakeSocket

async function openBoard(): Promise<void> {
  render(
    <SoundboardPopover>
      <button type="button">Efeitos sonoros</button>
    </SoundboardPopover>
  )
  await userEvent.click(screen.getByRole('button', { name: 'Efeitos sonoros' }))
}

function setup(over: Partial<ReturnType<typeof useApp.getState>> = {}): void {
  useApp.setState({
    ...initialState,
    self: me,
    serverUrl: 'http://srv',
    access: basicAccess,
    sounds: [meu, daAna],
    soundsLoaded: true,
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

describe('popup sem modal', () => {
  it('abre ancorado no botão sem bloquear o resto do app; clicar fora fecha', async () => {
    setup()
    const neighbor = vi.fn()
    render(
      <>
        <button type="button" onClick={neighbor}>
          Outro botão
        </button>
        <SoundboardPopover>
          <button type="button">Efeitos sonoros</button>
        </SoundboardPopover>
      </>
    )
    const trigger = screen.getByRole('button', { name: 'Efeitos sonoros' })
    await userEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'Efeitos sonoros' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Outro botão' }).closest('[aria-hidden="true"]')).toBeNull()
    expect(document.body.style.pointerEvents).not.toBe('none')
    await userEvent.click(screen.getByRole('button', { name: 'Outro botão' }))
    expect(neighbor).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Efeitos sonoros' })).toBeNull())
  })

  it('Esc fecha', async () => {
    setup()
    await openBoard()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Efeitos sonoros' })).toBeNull())
  })

  it('clicar no botão de novo fecha', async () => {
    setup()
    await openBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Efeitos sonoros' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Efeitos sonoros' })).toBeNull())
  })

  it('abrir busca a coleção de novo', async () => {
    setup()
    await openBoard()
    expect(socket.sent('sound:list')).toHaveLength(1)
  })

  it('fechar no meio do envio e abrir de novo volta para a grade', async () => {
    setup()
    await openBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar um som' }))
    expect(screen.getByLabelText(/Arquivo/)).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('dialog', { name: 'Efeitos sonoros' })).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Efeitos sonoros' }))
    expect(await screen.findByRole('list', { name: 'Sons' })).toBeTruthy()
  })
})

describe('grade de sons', () => {
  it('o controle de volume dos efeitos sonoros mostra e muda o volume (vale só nesta máquina)', async () => {
    setup({ soundboardVolume: 0.6 })
    await openBoard()
    const slider = screen.getByRole('slider', { name: 'Volume dos efeitos sonoros' }) as HTMLInputElement
    expect(slider.value).toBe('60')
    expect(screen.getByText('60%')).toBeTruthy()
    fireEvent.change(slider, { target: { value: '25' } })
    expect(useApp.getState().soundboardVolume).toBe(0.25)
    expect(JSON.parse(localStorage.getItem('concord:audio') ?? '{}')).toMatchObject({ soundboardVolume: 0.25 })
  })

  it('clicar toca para a minha sala', async () => {
    setup()
    socket.replyTo('sound:play', () => ({ ok: true }))
    await openBoard()
    const list = screen.getByRole('list', { name: 'Sons' })
    expect(within(list).getAllByRole('button', { name: /^Tocar/ }).map((b) => b.textContent)).toEqual(['📯Buzina', 'Risada'])
    await userEvent.click(screen.getByRole('button', { name: 'Tocar Risada' }))
    expect(socket.sent('sound:play')[0][0]).toEqual({ channelId: 'sala', soundId: 's2' })
  })

  it('erro do servidor aparece na janela', async () => {
    setup()
    socket.replyTo('sound:play', () => ({ ok: false, error: 'Espere o som anterior terminar' }))
    await openBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Tocar Buzina' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Espere o som anterior terminar')
  })

  it('fora da sala ou sem poder falar: explica e não deixa tocar', async () => {
    setup({ myVoiceChannelId: null })
    await openBoard()
    expect(screen.getByText('Entre numa sala de voz para tocar sons.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tocar Buzina' })).toHaveProperty('disabled', true)
    cleanup()
    setup({ voiceCanSpeak: false })
    await openBoard()
    expect(screen.getByText(/não pode falar nesta sala/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tocar Risada' })).toHaveProperty('disabled', true)
  })

  it('coleção vazia convida a enviar', async () => {
    setup({ sounds: [] })
    await openBoard()
    expect(screen.getByText('Nenhum som ainda. Envie o primeiro!')).toBeTruthy()
  })

  it('apagar: só o meu (sem manageMessages), com confirmação', async () => {
    setup()
    socket.replyTo('sound:delete', () => ({ ok: true }))
    await openBoard()
    expect(screen.queryByRole('button', { name: 'Apagar Risada' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Apagar Buzina' }))
    expect(socket.sent('sound:delete')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(socket.sent('sound:delete')[0][0]).toBe('s1')
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Tocar Buzina' })).toBeNull())
  })

  it('quem gerencia mensagens pode apagar o de outra pessoa', async () => {
    const access = { ...basicAccess, roles: [{ ...basicAccess.roles[0], permissions: [...basicAccess.roles[0].permissions, 'manageMessages'] }] } as AccessState
    setup({ access })
    await openBoard()
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
    await openBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar um som' }))
    pick(new File([new Uint8Array(100)], 'air_horn.ogg', { type: 'audio/ogg' }))
    expect(await screen.findByLabelText('Prévia do som')).toBeTruthy()
    expect(screen.getByLabelText('Nome')).toHaveProperty('value', 'air horn')
    await userEvent.click(screen.getByRole('button', { name: '📢' }))
    expect(screen.getByLabelText('Emoji escolhido: 📢')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ name: 'air horn', emoji: '📢', token: 'tok' }))
    expect(await screen.findByRole('button', { name: 'Tocar air horn' })).toBeTruthy()
  })

  it('arquivo longo: escolhe o início do trecho de 5 s e envia o trecho cortado em WAV', async () => {
    setup()
    localStorage.setItem(TOKEN_KEY, 'tok')
    const channel = Float32Array.from({ length: 8000 }, (_, i) => i / 8000)
    vi.spyOn(soundTransport, 'duration').mockResolvedValueOnce(8000).mockResolvedValueOnce(5000)
    vi.spyOn(soundTransport, 'decode').mockResolvedValue({ sampleRate: 1000, channels: [channel] })
    const send = vi.spyOn(soundTransport, 'send').mockResolvedValue(sound('s9', 'longo', 'acc-eu'))
    await openBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar um som' }))
    pick(new File([new Uint8Array(100)], 'longo.mp3', { type: 'audio/mpeg' }))
    const start = await screen.findByLabelText('Início do trecho')
    expect(screen.getByText('Trecho de 0,0 s a 5,0 s (de 8,0 s)')).toBeTruthy()
    expect(screen.getByLabelText('Prévia do som')).toBeTruthy()
    fireEvent.change(start, { target: { value: '2000' } })
    expect(screen.getByText('Trecho de 2,0 s a 7,0 s (de 8,0 s)')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByRole('button', { name: 'Tocar longo' })).toBeTruthy()
    const sent = send.mock.calls[0][0].file
    expect(sent.type).toBe('audio/wav')
    expect(sent.size).toBe(44 + 5000 * 2)
    expect(new DataView(await sent.arrayBuffer()).getInt16(44, true)).toBe(Math.round(channel[2000] * 32767))
  })

  it('áudio que não dá para ler: avisa e não deixa enviar', async () => {
    setup()
    vi.spyOn(soundTransport, 'duration').mockResolvedValue(null)
    vi.spyOn(soundTransport, 'decode').mockResolvedValue(null)
    await openBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar um som' }))
    pick(new File([new Uint8Array(100)], 'quebrado.mp3', { type: 'audio/mpeg' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível ler esse áudio. Use MP3, OGG, WAV ou WebM.')
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveProperty('disabled', true)
  })

  it('erro do servidor aparece no formulário', async () => {
    setup()
    localStorage.setItem(TOKEN_KEY, 'tok')
    vi.spyOn(soundTransport, 'duration').mockResolvedValue(3000)
    vi.spyOn(soundTransport, 'send').mockRejectedValue(new Error('Já existe um som com esse nome'))
    await openBoard()
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

describe('seletor de emoji', () => {
  it('clicar escolhe, clicar no escolhido tira, e as categorias trocam a grade', async () => {
    const changes: string[] = []
    const { rerender } = render(<EmojiPicker value="" onChange={(e) => changes.push(e)} />)
    await userEvent.click(screen.getByRole('button', { name: '🔊' }))
    rerender(<EmojiPicker value="🔊" onChange={(e) => changes.push(e)} />)
    expect(screen.getByRole('button', { name: '🔊' }).getAttribute('aria-pressed')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: '🔊' }))
    expect(changes).toEqual(['🔊', ''])
    await userEvent.click(screen.getByRole('tab', { name: 'Bichos' }))
    expect(screen.getByRole('group', { name: 'Emojis: Bichos' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '🐐' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '🔊' })).toBeNull()
  })

  it('todos os emojis da lista passam na regra do servidor e não se repetem', () => {
    const all = EMOJI_GROUPS.flatMap((g) => g.emojis)
    expect(new Set(all).size).toBe(all.length)
    for (const e of all) expect(cleanSoundEmoji(e)).toBe(e)
  })

  it('no formulário: sem emoji, o envio vai sem emoji', async () => {
    setup()
    localStorage.setItem(TOKEN_KEY, 'tok')
    vi.spyOn(soundTransport, 'duration').mockResolvedValue(3000)
    const send = vi.spyOn(soundTransport, 'send').mockResolvedValue(sound('s9', 'Bip', 'acc-eu'))
    await openBoard()
    await userEvent.click(screen.getByRole('button', { name: 'Enviar um som' }))
    expect(screen.getByLabelText('Sem emoji')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Arquivo/), { target: { files: [new File([new Uint8Array(10)], 'bip.ogg', { type: 'audio/ogg' })] } })
    await screen.findByLabelText('Prévia do som')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ name: 'bip', emoji: null }))
  })
})
