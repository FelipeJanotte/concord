// @vitest-environment jsdom
import '@/test/ui-sdk-dom'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EVERYONE_ROLE_ID, type AccessState, type Channel, type MusicCollection, type MusicState, type MusicTrack, type Permission, type SavedPlaylist } from '@shared/types'
import { UtilityRail } from '@/components/rail/UtilityRail'
import { TooltipProvider } from '@/components/ui/tooltip'
import { applyMusicState } from '@/lib/actions/music'
import { bindPlaylistsEvents } from '@/lib/actions/playlists'
import { setSocket } from '@/lib/core'
import { initialState, useApp } from '@/store'
import { FakeSocket } from '@/test/fake-socket'
import { MusicView } from './MusicView'

const sala: Channel = { id: 'sala', name: 'Sala de jogos', type: 'voice', createdAt: 0 }

const track = (id: string, title: string, durationMs = 185_000): MusicTrack => ({
  id,
  title,
  artists: ['Tom Jobim', 'Vinicius de Moraes'],
  coverUrl: null,
  durationMs,
  url: `https://open.spotify.com/track/${id}`,
  requestedBy: { accountId: 'acc-ana', name: 'Ana' }
})
const ipanema = track('t1', 'Garota de Ipanema')
const aguas = track('t2', 'Águas de Março', 212_000)
const chega = track('t3', 'Chega de Saudade', 160_000)
const room = (over: Partial<MusicState> = {}): MusicState => ({
  channelId: 'sala',
  nowPlaying: ipanema,
  queue: [aguas, chega],
  paused: false,
  elapsedMs: 0,
  ...over
})

const bossaNova: MusicCollection = { kind: 'playlist', title: 'Bossa Nova Essentials', url: 'https://open.spotify.com/playlist/bossa' }

const saved = (id: string, name: string, savedBy: string, kind: SavedPlaylist['kind'] = 'playlist'): SavedPlaylist => ({
  id,
  name,
  url: `https://open.spotify.com/${kind}/${id}`,
  kind,
  savedBy: { accountId: savedBy, name: savedBy === 'acc-eu' ? 'Eu' : 'Bia' },
  createdAt: '2026-11-18T00:00:00.000Z'
})

function access(permissions: Permission[]): AccessState {
  return {
    ownerAccountId: 'acc-dona',
    roles: [
      { id: EVERYONE_ROLE_ID, name: '@todos', color: null, position: 0, permissions: ['view', 'send', 'connect', 'speak'] },
      { id: 'r-mod', name: 'Mod', color: null, position: 1, permissions }
    ],
    members: [{ accountId: 'acc-eu', roleIds: ['r-mod'] }],
    overrides: []
  }
}

let socket: FakeSocket

function renderView() {
  return render(
    <TooltipProvider>
      <MusicView />
    </TooltipProvider>
  )
}

const requestField = () => screen.getByRole('textbox', { name: 'Pedir uma música' })

beforeEach(() => {
  socket = new FakeSocket()
  setSocket(socket.asSocket())
  socket.replyTo('music:queue', () => ({ ok: true, state: room() }))
  socket.replyTo('playlist:list', () => ({ ok: true, playlists: [] }))
  useApp.setState({
    ...initialState,
    self: { id: 'sock-eu', accountId: 'acc-eu', name: 'Eu', tag: 'eu', color: '#fff', avatarUrl: null },
    channels: [sala],
    access: access([]),
    myVoiceChannelId: 'sala'
  })
})

afterEach(() => {
  cleanup()
  setSocket(null)
  vi.restoreAllMocks()
})

describe('falhas ao carregar', () => {
  it('playlists que não carregam viram aviso', async () => {
    socket.replyTo('playlist:list', () => ({ ok: false, error: 'Playlists fora do ar' }))
    renderView()
    await waitFor(() => expect(useApp.getState().notice?.text).toBe('Playlists fora do ar'))
  })

  it('a fila que não carrega vira aviso', async () => {
    socket.replyTo('music:queue', () => ({ ok: false, error: 'Fila fora do ar' }))
    renderView()
    await waitFor(() => expect(useApp.getState().notice?.text).toBe('Fila fora do ar'))
  })
})

describe('barra de úteis', () => {
  it('o botão Música abre a área de música e fica marcado', async () => {
    render(
      <TooltipProvider>
        <UtilityRail />
      </TooltipProvider>
    )
    const button = screen.getByRole('button', { name: 'Música' })
    expect(button.getAttribute('aria-current')).toBeNull()
    await userEvent.click(button)
    expect(useApp.getState().section).toBe('music')
    expect(button.getAttribute('aria-current')).toBe('page')
  })
})

describe('fora de uma sala de voz', () => {
  it('mostra o convite para entrar numa sala e o campo fica desativado', () => {
    useApp.setState({ myVoiceChannelId: null })
    renderView()
    expect(screen.getByText('Entre numa sala de voz para ouvir música juntos')).toBeTruthy()
    expect((requestField() as HTMLInputElement).disabled).toBe(true)
    expect(socket.sent('music:queue')).toEqual([])
  })
})

describe('tocando agora', () => {
  it('mostra a sala, a música, quem pediu e busca o estado da sala ao abrir', async () => {
    renderView()
    expect(screen.getByRole('heading', { name: 'Música' })).toBeTruthy()
    expect(screen.getByText('Sala de jogos')).toBeTruthy()
    const hero = await screen.findByRole('region', { name: 'Tocando agora' })
    expect(socket.sent('music:queue')).toEqual([['sala']])
    expect(within(hero).getByRole('heading', { name: 'Garota de Ipanema' })).toBeTruthy()
    expect(hero.textContent).toContain('Tom Jobim, Vinicius de Moraes')
    expect(hero.textContent).toContain('pedida por Ana')
  })

  it('o progresso vem do elapsedMs e para enquanto está pausado', async () => {
    socket.replyTo('music:queue', () => ({ ok: true, state: room({ paused: true, elapsedMs: 65_000 }) }))
    renderView()
    const progress = await screen.findByRole('progressbar', { name: 'Progresso da música' })
    expect(screen.getByText('1:05')).toBeTruthy()
    expect(screen.getByText('3:05')).toBeTruthy()
    expect(Number(progress.getAttribute('aria-valuenow'))).toBeCloseTo((65_000 / 185_000) * 100, 0)
  })

  it('tocando, o progresso anda a partir de quando o estado chegou', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    socket.replyTo('music:queue', () => ({ ok: true, state: room({ elapsedMs: 10_000 }) }))
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      renderView()
      await waitFor(() => expect(screen.getByText('0:10')).toBeTruthy())
      now.mockReturnValue(1_020_000)
      act(() => vi.advanceTimersByTime(1000))
      expect(screen.getByText('0:30')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ao retomar, o progresso já conta a partir de agora, sem esperar o próximo segundo', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    socket.replyTo('music:queue', () => ({ ok: true, state: room({ paused: true, elapsedMs: 10_000 }) }))
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      renderView()
      await waitFor(() => expect(screen.getByText('0:10')).toBeTruthy())
      act(() => {
        applyMusicState(room({ paused: false, elapsedMs: 10_000 }))
        now.mockReturnValue(1_002_000)
      })
      expect(screen.getByText('0:12')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('pausar e retomar mandam o evento certo e o botão troca com o estado', async () => {
    socket.replyTo('music:pause', () => ({ ok: true, state: room({ paused: true, elapsedMs: 30_000 }) }))
    socket.replyTo('music:resume', () => ({ ok: true, state: room({ paused: false, elapsedMs: 30_000 }) }))
    renderView()
    await userEvent.click(await screen.findByRole('button', { name: 'Pausar' }))
    expect(socket.sent('music:pause')).toEqual([[{ channelId: 'sala' }]])
    await userEvent.click(await screen.findByRole('button', { name: 'Retomar' }))
    expect(socket.sent('music:resume')).toEqual([[{ channelId: 'sala' }]])
    expect(await screen.findByRole('button', { name: 'Pausar' })).toBeTruthy()
  })

  it('pular e parar mandam o comando para a minha sala', async () => {
    socket.replyTo('music:skip', () => ({ ok: true, state: room({ nowPlaying: aguas, queue: [chega] }) }))
    socket.replyTo('music:stop', () => ({ ok: true, state: room({ nowPlaying: null, queue: [] }) }))
    renderView()
    await userEvent.click(await screen.findByRole('button', { name: 'Pular' }))
    expect(socket.sent('music:skip')).toEqual([[{ channelId: 'sala' }]])
    await userEvent.click(screen.getByRole('button', { name: 'Parar e limpar a fila' }))
    expect(socket.sent('music:stop')).toEqual([[{ channelId: 'sala' }]])
    expect(await screen.findByText('Nada tocando agora')).toBeTruthy()
  })
})

describe('pedir uma música', () => {
  it('Enter manda music:play para a minha sala e limpa o campo', async () => {
    socket.replyTo('music:play', () => ({ ok: true, state: room(), added: 1, collection: null }))
    renderView()
    await userEvent.type(requestField(), 'garota de ipanema{Enter}')
    expect(socket.sent('music:play')).toEqual([[{ channelId: 'sala', query: 'garota de ipanema' }]])
    await waitFor(() => expect((requestField() as HTMLInputElement).value).toBe(''))
  })

  it('erro do servidor aparece junto ao campo e o texto fica', async () => {
    socket.replyTo('music:play', () => ({ ok: false, error: 'Nada encontrado para essa busca' }))
    renderView()
    await userEvent.type(requestField(), 'música que não existe')
    await userEvent.click(screen.getByRole('button', { name: 'Tocar' }))
    expect(await screen.findByText('Nada encontrado para essa busca')).toBeTruthy()
    expect((requestField() as HTMLInputElement).value).toBe('música que não existe')
    expect(useApp.getState().notice).toBeNull()
  })
})

describe('fila', () => {
  it('lista as músicas com a contagem', async () => {
    renderView()
    const queue = await screen.findByRole('list', { name: 'Fila' })
    expect(screen.getByRole('heading', { name: 'A seguir 2' })).toBeTruthy()
    const items = within(queue).getAllByRole('listitem')
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('Águas de Março'),
      expect.stringContaining('Chega de Saudade')
    ])
    expect(items[0].textContent).toContain('3:32')
    expect(items[0].textContent).toContain('Ana')
  })

  it('fila vazia', async () => {
    socket.replyTo('music:queue', () => ({ ok: true, state: room({ queue: [] }) }))
    renderView()
    expect(await screen.findByText('A fila está vazia')).toBeTruthy()
  })

  it('clicar numa música da fila pula para ela na minha sala', async () => {
    socket.replyTo('music:jump', () => ({ ok: true, state: room({ nowPlaying: chega, queue: [] }) }))
    renderView()
    await userEvent.click(await screen.findByRole('button', { name: 'Tocar agora: Chega de Saudade' }))
    expect(socket.sent('music:jump')).toEqual([[{ channelId: 'sala', trackId: 't3' }]])
    const hero = await screen.findByRole('region', { name: 'Tocando agora' })
    await waitFor(() => expect(within(hero).getByRole('heading', { name: 'Chega de Saudade' })).toBeTruthy())
    expect(await screen.findByText('A fila está vazia')).toBeTruthy()
  })

  it('pular para uma que já saiu da fila vira aviso', async () => {
    socket.replyTo('music:jump', () => ({ ok: false, error: 'Essa música não está mais na fila' }))
    renderView()
    await userEvent.click(await screen.findByRole('button', { name: 'Tocar agora: Águas de Março' }))
    await waitFor(() => expect(useApp.getState().notice?.text).toBe('Essa música não está mais na fila'))
  })

  it('Embaralhar manda music:shuffle para a minha sala e mostra a fila nova', async () => {
    socket.replyTo('music:shuffle', () => ({ ok: true, state: room({ queue: [chega, aguas] }) }))
    renderView()
    const button = await screen.findByRole('button', { name: 'Embaralhar a fila' })
    expect(button.parentElement).toBe(screen.getByRole('button', { name: 'Pular' }).parentElement)
    expect(within(screen.getByRole('region', { name: 'Tocando agora' })).getByRole('button', { name: 'Embaralhar a fila' })).toBe(button)
    await userEvent.click(button)
    expect(socket.sent('music:shuffle')).toEqual([[{ channelId: 'sala' }]])
    const queue = screen.getByRole('list', { name: 'Fila' })
    await waitFor(() => expect(within(queue).getAllByRole('listitem')[0].textContent).toContain('Chega de Saudade'))
  })

  it('com menos de 2 músicas na fila, Embaralhar fica desativado', async () => {
    socket.replyTo('music:queue', () => ({ ok: true, state: room({ queue: [aguas] }) }))
    renderView()
    const button = await screen.findByRole('button', { name: 'Embaralhar a fila' })
    expect(button.getAttribute('aria-disabled') === 'true' || (button as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(button)
    expect(socket.sent('music:shuffle')).toEqual([])
  })
})

describe('salvar a playlist tocada', () => {
  async function playCollection() {
    socket.replyTo('music:play', () => ({ ok: true, state: room(), added: 12, collection: bossaNova }))
    renderView()
    await userEvent.type(requestField(), `${bossaNova.url}{Enter}`)
  }

  it('o link de uma playlist mostra o convite; só salva no clique, com o nome editado', async () => {
    socket.replyTo('playlist:create', (request) => ({
      ok: true,
      playlist: { ...saved('bossa', (request as { name: string }).name, 'acc-eu'), url: bossaNova.url }
    }))
    await playCollection()
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar playlist “Bossa Nova Essentials”' }))
    expect(socket.sent('playlist:create')).toEqual([])
    const name = screen.getByRole('textbox', { name: 'Nome da playlist' }) as HTMLInputElement
    expect(name.value).toBe('Bossa Nova Essentials')
    await userEvent.clear(name)
    await userEvent.type(name, 'Bossa do domingo{Enter}')
    expect(socket.sent('playlist:create')).toEqual([[{ name: 'Bossa do domingo', url: bossaNova.url }]])
    await waitFor(() => expect(screen.queryByRole('button', { name: /Salvar playlist/ })).toBeNull())
    expect(useApp.getState().notice?.text).toBe('Playlist “Bossa do domingo” salva')
  })

  it('dá para dispensar o convite sem salvar', async () => {
    await playCollection()
    await userEvent.click(await screen.findByRole('button', { name: 'Dispensar' }))
    expect(screen.queryByRole('button', { name: /Salvar playlist/ })).toBeNull()
    expect(socket.sent('playlist:create')).toEqual([])
  })

  it('o convite some quando a música para', async () => {
    await playCollection()
    await screen.findByRole('button', { name: /Salvar playlist/ })
    act(() => applyMusicState(room({ nowPlaying: null, queue: [] })))
    expect(screen.queryByRole('button', { name: /Salvar playlist/ })).toBeNull()
  })

  it('o convite de uma playlist de outra sala não aparece na minha', async () => {
    useApp.setState({ roomCollection: { channelId: 'outra', collection: bossaNova } })
    renderView()
    await screen.findByRole('region', { name: 'Tocando agora' })
    expect(screen.queryByRole('button', { name: /Salvar playlist/ })).toBeNull()
  })

  it('sem nada tocando na sala, não há convite', async () => {
    socket.replyTo('music:queue', () => ({ ok: true, state: room({ nowPlaying: null, queue: [] }) }))
    useApp.setState({ roomCollection: { channelId: 'sala', collection: bossaNova } })
    renderView()
    await waitFor(() => expect(socket.sent('music:queue')).toHaveLength(1))
    expect(screen.queryByRole('button', { name: /Salvar playlist/ })).toBeNull()
  })

  it('uma música solta não mostra o convite', async () => {
    socket.replyTo('music:play', () => ({ ok: true, state: room(), added: 1, collection: null }))
    renderView()
    await userEvent.type(requestField(), 'garota de ipanema{Enter}')
    await waitFor(() => expect(socket.sent('music:play')).toHaveLength(1))
    expect(screen.queryByRole('button', { name: /Salvar playlist/ })).toBeNull()
  })
})

describe('playlists da comunidade', () => {
  async function openDrawer() {
    renderView()
    await userEvent.click(screen.getByRole('button', { name: 'Playlists' }))
    return screen.getByRole('dialog', { name: 'Playlists da comunidade' })
  }

  it('o botão "Playlists" fica ao lado do campo de pedir música, com o nome escrito, e não no cabeçalho', async () => {
    renderView()
    const button = screen.getByRole('button', { name: 'Playlists' })
    expect(button.textContent).toBe('Playlists')
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: 'Playlists' })).toBeNull()
    expect(within(screen.getByRole('group', { name: 'Pedir música' })).getByRole('button', { name: 'Playlists' })).toBe(button)
    expect(within(screen.getByRole('group', { name: 'Pedir música' })).getByRole('textbox', { name: 'Pedir uma música' })).toBeTruthy()
  })

  it('fora de uma sala, o botão "Playlists" também fica ao lado do campo', () => {
    useApp.setState({ myVoiceChannelId: null })
    renderView()
    expect(within(screen.getByRole('group', { name: 'Pedir música' })).getByRole('button', { name: 'Playlists' })).toBeTruthy()
  })

  it('lista nome, tipo e quem salvou; Tocar toca o link na minha sala', async () => {
    socket.replyTo('playlist:list', () => ({ ok: true, playlists: [saved('p1', 'Bossa do domingo', 'acc-eu'), saved('a1', 'Elis & Tom', 'acc-bia', 'album')] }))
    socket.replyTo('music:play', () => ({ ok: true, state: room(), added: 20, collection: null }))
    const drawer = await openDrawer()
    const items = await within(drawer).findAllByRole('listitem')
    expect(items[0].textContent).toContain('Bossa do domingo')
    expect(items[0].textContent).toContain('Playlist')
    expect(items[1].textContent).toContain('Álbum')
    expect(items[1].textContent).toContain('Bia')
    await userEvent.click(within(items[1]).getByRole('button', { name: 'Tocar Elis & Tom' }))
    expect(socket.sent('music:play')).toEqual([[{ channelId: 'sala', query: 'https://open.spotify.com/album/a1' }]])
  })

  it('Apagar só para quem salvou, pedindo confirmação', async () => {
    socket.replyTo('playlist:list', () => ({ ok: true, playlists: [saved('p1', 'Bossa do domingo', 'acc-eu'), saved('a1', 'Elis & Tom', 'acc-bia', 'album')] }))
    socket.replyTo('playlist:delete', () => ({ ok: true }))
    const drawer = await openDrawer()
    await within(drawer).findByText('Bossa do domingo')
    expect(within(drawer).queryByRole('button', { name: 'Apagar Elis & Tom' })).toBeNull()
    await userEvent.click(within(drawer).getByRole('button', { name: 'Apagar Bossa do domingo' }))
    expect(socket.sent('playlist:delete')).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(socket.sent('playlist:delete')).toEqual([['p1']])
    await waitFor(() => expect(within(drawer).queryByText('Bossa do domingo')).toBeNull())
  })

  it('quem gerencia mensagens pode apagar a de outra pessoa', async () => {
    useApp.setState({ access: access(['manageMessages']) })
    socket.replyTo('playlist:list', () => ({ ok: true, playlists: [saved('a1', 'Elis & Tom', 'acc-bia', 'album')] }))
    const drawer = await openDrawer()
    expect(await within(drawer).findByRole('button', { name: 'Apagar Elis & Tom' })).toBeTruthy()
  })

  it('fora de uma sala, Tocar fica desativado', async () => {
    useApp.setState({ myVoiceChannelId: null })
    socket.replyTo('playlist:list', () => ({ ok: true, playlists: [saved('p1', 'Bossa do domingo', 'acc-eu')] }))
    const drawer = await openDrawer()
    const play = await within(drawer).findByRole('button', { name: 'Tocar Bossa do domingo' })
    expect((play as HTMLButtonElement).disabled).toBe(true)
  })

  it('sem playlists: explica como salvar uma', async () => {
    const drawer = await openDrawer()
    expect(await within(drawer).findByText(/Toque o link de uma playlist ou álbum/)).toBeTruthy()
  })

  it('playlist:created e playlist:deleted atualizam a lista ao vivo', async () => {
    bindPlaylistsEvents(socket.asSocket())
    const drawer = await openDrawer()
    await within(drawer).findByText(/Toque o link de uma playlist ou álbum/)
    act(() => socket.receive('playlist:created', saved('p9', 'Samba de raiz', 'acc-bia')))
    expect(within(drawer).getByText('Samba de raiz')).toBeTruthy()
    act(() => socket.receive('playlist:deleted', { id: 'p9' }))
    expect(within(drawer).queryByText('Samba de raiz')).toBeNull()
  })
})
