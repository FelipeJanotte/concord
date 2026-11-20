import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SCREEN_PREVIEW_INTERVAL_MS, type User } from '@shared/types'
import { setSocket } from '@/lib/core'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { fetchScreenPreview, SCREEN_PREVIEW_FIRST_MS } from './screen-preview'

const snapshot = vi.hoisted(() => vi.fn<(track: MediaStreamTrack) => Promise<string | null>>())
const snapshotFromImage = vi.hoisted(() => vi.fn<(image: string) => Promise<string | null>>())
vi.mock('@/lib/screen-snapshot', () => ({ snapshotScreen: snapshot, snapshotImage: snapshotFromImage }))

const SELF = { id: 'eu' } as User
const TRACK = { kind: 'video' } as MediaStreamTrack
let socket: FakeSocket

beforeEach(() => {
  vi.useFakeTimers()
  useApp.setState({ ...initialState, self: SELF, myVoiceChannelId: 'sala' })
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  snapshot.mockReset().mockResolvedValue('data:image/jpeg;base64,AAAA')
  snapshotFromImage.mockReset().mockImplementation(async (image) => image.replace('data:image/png', 'data:image/jpeg'))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(voice, 'screenMediaTrack').mockImplementation((userId) => (userId === SELF.id ? TRACK : undefined))
})

afterEach(() => {
  useApp.setState({ sharing: false })
  vi.unstubAllGlobals()
  setSocket(null)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('miniaturas da própria tela', () => {
  it('compartilhando, manda a miniatura logo depois de começar e de novo a cada intervalo', async () => {
    useApp.setState({ sharing: true })
    await vi.advanceTimersByTimeAsync(SCREEN_PREVIEW_FIRST_MS)
    expect(snapshot).toHaveBeenCalledWith(TRACK)
    expect(socket.sent('voice:preview')).toEqual([['data:image/jpeg;base64,AAAA']])

    snapshot.mockResolvedValue('data:image/jpeg;base64,BBBB')
    await vi.advanceTimersByTimeAsync(SCREEN_PREVIEW_INTERVAL_MS)
    expect(socket.sent('voice:preview')).toEqual([['data:image/jpeg;base64,AAAA'], ['data:image/jpeg;base64,BBBB']])
  })

  it('parou de compartilhar: não manda mais', async () => {
    useApp.setState({ sharing: true })
    await vi.advanceTimersByTimeAsync(SCREEN_PREVIEW_FIRST_MS)
    useApp.setState({ sharing: false })
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(SCREEN_PREVIEW_INTERVAL_MS * 3)
    expect(socket.sent('voice:preview')).toHaveLength(1)
  })

  it('sem a faixa da tela ou sem imagem: não manda nada', async () => {
    vi.mocked(voice.screenMediaTrack).mockReturnValue(undefined)
    useApp.setState({ sharing: true })
    await vi.advanceTimersByTimeAsync(SCREEN_PREVIEW_FIRST_MS)
    expect(snapshot).not.toHaveBeenCalled()

    vi.mocked(voice.screenMediaTrack).mockReturnValue(TRACK)
    snapshot.mockResolvedValue(null)
    await vi.advanceTimersByTimeAsync(SCREEN_PREVIEW_INTERVAL_MS)
    snapshot.mockRejectedValue(new Error('sem quadro'))
    await vi.advanceTimersByTimeAsync(SCREEN_PREVIEW_INTERVAL_MS)
    expect(socket.sent('voice:preview')).toEqual([])
  })
})

describe('miniaturas da tela nativa', () => {
  let previews: string[]
  let previewFailure: Error | null

  beforeEach(() => {
    previews = ['data:image/png;base64,UM==', 'data:image/png;base64,RE9JUw==']
    previewFailure = null
    const screen = {
      preview: async (): Promise<string> => {
        if (previewFailure) throw previewFailure
        return previews.shift() ?? 'data:image/png;base64,'
      }
    }
    vi.stubGlobal('window', { api: { screen } })
    vi.mocked(voice.screenMediaTrack).mockReturnValue(undefined)
  })

  it('compartilhando pela tela nativa, manda a miniatura nova do Rust no mesmo ritmo', async () => {
    useApp.setState({ sharing: true, ownScreenThumbnail: 'data:image/png;base64,AAAA' })
    await vi.advanceTimersByTimeAsync(SCREEN_PREVIEW_FIRST_MS)
    expect(socket.sent('voice:preview')).toEqual([['data:image/jpeg;base64,UM==']])
    await vi.advanceTimersByTimeAsync(SCREEN_PREVIEW_INTERVAL_MS)
    expect(socket.sent('voice:preview')).toEqual([['data:image/jpeg;base64,UM=='], ['data:image/jpeg;base64,RE9JUw==']])
  })

  it('a miniatura nativa falha: não manda nada e avisa no console', async () => {
    previewFailure = new Error('Nenhuma tela está sendo compartilhada')
    useApp.setState({ sharing: true, ownScreenThumbnail: 'data:image/png;base64,AAAA' })
    await vi.advanceTimersByTimeAsync(SCREEN_PREVIEW_FIRST_MS)
    expect(socket.sent('voice:preview')).toEqual([])
    expect(console.warn).toHaveBeenCalledWith('[tela] não foi possível gerar a prévia:', previewFailure)
  })
})

describe('fetchScreenPreview', () => {
  it('pede a prévia de quem compartilha e devolve a resposta do servidor', async () => {
    socket.replyTo('voice:preview-get', () => ({ ok: true, image: 'data:image/jpeg;base64,CCCC' }))
    expect(await fetchScreenPreview('ana')).toEqual({ ok: true, image: 'data:image/jpeg;base64,CCCC' })
    expect(socket.sent('voice:preview-get')).toEqual([['ana']])
  })

  it('sem conexão ou com falha: prévia indisponível', async () => {
    socket.replyTo('voice:preview-get', () => {
      throw new Error('caiu')
    })
    expect(await fetchScreenPreview('ana')).toEqual({ ok: false, error: 'Prévia indisponível' })
    setSocket(null)
    expect(await fetchScreenPreview('ana')).toEqual({ ok: false, error: 'Prévia indisponível' })
  })
})
