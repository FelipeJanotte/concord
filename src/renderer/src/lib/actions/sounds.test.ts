// @vitest-environment jsdom
// Efeitos sonoros no app (B17): coleção, tocar localmente ao receber sound:played (saída, volume e
// silenciar por pessoa, deafen, outra sala), indicador de quem tocou, tocar/apagar e enviar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sound } from '@shared/types'
import {
  bindSoundsEvents,
  checkSoundFile,
  deleteSound,
  loadSounds,
  openSoundboard,
  playSound,
  soundNameFromFile,
  soundOutput,
  soundTransport,
  uploadSound
} from '@/lib/actions/sounds'
import { setSocket, TOKEN_KEY } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'

const sound = (id: string, name: string, over: Partial<Sound> = {}): Sound => ({
  id,
  name,
  emoji: null,
  durationMs: 2000,
  uploaderId: 'acc-ana',
  url: `/sounds/${id}?a=1&e=2&s=3`,
  ...over
})
const buzina = sound('s1', 'Buzina', { emoji: '📯' })
const aplausos = sound('s2', 'aplausos')

let socket: FakeSocket
let play: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  useApp.setState({ ...initialState, serverUrl: 'http://srv:3001/', sounds: [buzina, aplausos], soundsLoaded: true })
  bindSoundsEvents(socket.asSocket())
  play = vi.spyOn(soundOutput, 'play').mockImplementation(() => {})
})

afterEach(() => {
  setSocket(null)
  vi.restoreAllMocks()
  vi.useRealTimers()
  localStorage.clear()
})

describe('coleção', () => {
  it('loadSounds busca e ordena pelo nome (sem diferenciar maiúsculas)', async () => {
    useApp.setState({ sounds: [], soundsLoaded: false })
    socket.replyTo('sound:list', () => [buzina, aplausos])
    await loadSounds()
    expect(useApp.getState().sounds.map((s) => s.name)).toEqual(['aplausos', 'Buzina'])
    expect(useApp.getState().soundsLoaded).toBe(true)
  })

  it('sound:created entra no lugar certo (sem repetir) e sound:deleted tira', () => {
    socket.receive('sound:created', sound('s3', 'Bateria'))
    socket.receive('sound:created', sound('s3', 'Bateria'))
    expect(useApp.getState().sounds.map((s) => s.name)).toEqual(['aplausos', 'Bateria', 'Buzina'])
    socket.receive('sound:deleted', 's1')
    expect(useApp.getState().sounds.map((s) => s.id)).toEqual(['s2', 's3'])
  })

  it('abrir a janela busca a coleção de novo (links novos)', async () => {
    socket.replyTo('sound:list', () => [aplausos])
    openSoundboard()
    expect(useApp.getState().soundboardOpen).toBe(true)
    await vi.waitFor(() => expect(useApp.getState().sounds).toEqual([aplausos]))
  })
})

describe('sound:played', () => {
  // como o servidor manda: `by` é a conexão (socket.id) de quem tocou, não o nome
  const played = { channelId: 'sala', soundId: 's1', by: 'sock-ana', accountId: 'acc-ana' }
  const ana = { id: 'sock-ana', accountId: 'acc-ana', name: 'Ana', tag: 'ana', color: '#fff', avatarUrl: null }

  it('toca o link completo pela saída escolhida, com o volume que dei para a pessoa', () => {
    useApp.setState({ myVoiceChannelId: 'sala', audioOutputId: 'fone', userVolumes: { 'acc-ana': 0.4 } })
    socket.receive('sound:played', played)
    expect(play).toHaveBeenCalledWith('http://srv:3001/sounds/s1?a=1&e=2&s=3', { volume: 0.4, outputId: 'fone' })
  })

  it('o volume de saída multiplica o volume da pessoa', () => {
    useApp.setState({ myVoiceChannelId: 'sala', userVolumes: { 'acc-ana': 0.5 }, outputVolume: 0.5 })
    socket.receive('sound:played', played)
    expect(play).toHaveBeenCalledWith(expect.any(String), { volume: 0.25, outputId: null })
  })

  it('indicador de quem tocou (pelo nome, não pelo id da conexão) até o som acabar', () => {
    vi.useFakeTimers()
    useApp.setState({ myVoiceChannelId: 'sala', users: [ana] })
    socket.receive('sound:played', played)
    expect(useApp.getState().soundsPlaying['acc-ana']).toMatchObject({ soundId: 's1', by: 'Ana' })
    vi.advanceTimersByTime(1999)
    expect(useApp.getState().soundsPlaying['acc-ana']).toBeDefined()
    vi.advanceTimersByTime(1)
    expect(useApp.getState().soundsPlaying).toEqual({})
  })

  it('quem tocou já saiu: o nome vem da conta; sem nada, "Alguém"', () => {
    useApp.setState({ myVoiceChannelId: 'sala', users: [{ ...ana, id: 'outra-conexao' }] })
    socket.receive('sound:played', played)
    expect(useApp.getState().soundsPlaying['acc-ana'].by).toBe('Ana')
    useApp.setState({ users: [], soundsPlaying: {} })
    socket.receive('sound:played', { ...played, accountId: 'acc-x' })
    expect(useApp.getState().soundsPlaying['acc-x'].by).toBe('Alguém')
  })

  it('com deafen ou com a pessoa silenciada só para mim: não toca (o indicador aparece)', () => {
    useApp.setState({ myVoiceChannelId: 'sala', deafened: true })
    socket.receive('sound:played', played)
    useApp.setState({ deafened: false, userMuted: { 'acc-ana': true } })
    socket.receive('sound:played', played)
    expect(play).not.toHaveBeenCalled()
    expect(useApp.getState().soundsPlaying['acc-ana']).toBeDefined()
  })

  it('de outra sala, fora da voz ou som desconhecido: ignora', () => {
    socket.receive('sound:played', played)
    useApp.setState({ myVoiceChannelId: 'outra' })
    socket.receive('sound:played', played)
    useApp.setState({ myVoiceChannelId: 'sala' })
    socket.receive('sound:played', { ...played, soundId: 'nada' })
    expect(play).not.toHaveBeenCalled()
    expect(useApp.getState().soundsPlaying).toEqual({})
  })
})

describe('tocar e apagar', () => {
  it('playSound manda a minha sala; fora da voz nem pede', async () => {
    await expect(playSound('s1')).rejects.toThrow('Entre na sala de voz para tocar sons')
    expect(socket.sent('sound:play')).toHaveLength(0)
    useApp.setState({ myVoiceChannelId: 'sala' })
    socket.replyTo('sound:play', () => ({ ok: true }))
    await playSound('s1')
    expect(socket.sent('sound:play')[0][0]).toEqual({ channelId: 'sala', soundId: 's1' })
  })

  it('erro do servidor vira exceção', async () => {
    useApp.setState({ myVoiceChannelId: 'sala' })
    socket.replyTo('sound:play', () => ({ ok: false, error: 'Espere o som anterior terminar' }))
    await expect(playSound('s1')).rejects.toThrow('Espere o som anterior terminar')
  })

  it('deleteSound tira da coleção; erro não tira', async () => {
    socket.replyTo('sound:delete', (id) => (id === 's1' ? { ok: true } : { ok: false, error: 'Você não pode apagar este som' }))
    await deleteSound('s1')
    expect(useApp.getState().sounds.map((s) => s.id)).toEqual(['s2'])
    await expect(deleteSound('s2')).rejects.toThrow('Você não pode apagar este som')
    expect(useApp.getState().sounds.map((s) => s.id)).toEqual(['s2'])
  })
})

describe('enviar', () => {
  const file = (bytes = 1000, type = 'audio/ogg'): Blob => new Blob([new Uint8Array(bytes)], { type })

  it('nome sugerido pelo arquivo', () => {
    expect(soundNameFromFile('air_horn-final.mp3')).toBe('air horn final')
    expect(soundNameFromFile(`${'x'.repeat(40)}.wav`)).toHaveLength(32)
  })

  it('confere tamanho e duração antes de enviar', async () => {
    const duration = vi.spyOn(soundTransport, 'duration')
    expect(await checkSoundFile(file(600 * 1024))).toBe('O som pode ter no máximo 512 KB')
    duration.mockResolvedValueOnce(6000)
    expect(await checkSoundFile(file())).toBe('O som pode ter no máximo 5 segundos')
    duration.mockResolvedValueOnce(null)
    expect(await checkSoundFile(file())).toMatch('Não foi possível ler esse áudio')
    duration.mockResolvedValueOnce(4800)
    expect(await checkSoundFile(file())).toBeNull()
  })

  it('envia com o token, nome limpo e emoji; o som entra na coleção', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok')
    vi.spyOn(soundTransport, 'duration').mockResolvedValue(3000)
    const created = sound('s9', 'Risada', { emoji: '😂' })
    const send = vi.spyOn(soundTransport, 'send').mockResolvedValue(created)
    const blob = file()
    await expect(uploadSound({ file: blob, name: '  Risada  ', emoji: ' 😂 ' })).resolves.toEqual(created)
    expect(send).toHaveBeenCalledWith({ serverUrl: 'http://srv:3001/', token: 'tok', file: blob, name: 'Risada', emoji: '😂' })
    expect(useApp.getState().sounds.map((s) => s.id)).toContain('s9')
  })

  it('recusa nome vazio, emoji grande e arquivo inválido sem chamar o servidor', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok')
    vi.spyOn(soundTransport, 'duration').mockResolvedValue(9000)
    const send = vi.spyOn(soundTransport, 'send')
    await expect(uploadSound({ file: file(), name: '  ' })).rejects.toThrow('O nome precisa ter de 1 a 32 caracteres')
    await expect(uploadSound({ file: file(), name: 'A', emoji: '123456789' })).rejects.toThrow('Use no máximo um emoji')
    await expect(uploadSound({ file: file(), name: 'A' })).rejects.toThrow('O som pode ter no máximo 5 segundos')
    expect(send).not.toHaveBeenCalled()
  })

  it('erro do servidor vira exceção', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok')
    vi.spyOn(soundTransport, 'duration').mockResolvedValue(3000)
    vi.spyOn(soundTransport, 'send').mockRejectedValue(new Error('Já existe um som com esse nome'))
    await expect(uploadSound({ file: file(), name: 'Buzina' })).rejects.toThrow('Já existe um som com esse nome')
  })
})
