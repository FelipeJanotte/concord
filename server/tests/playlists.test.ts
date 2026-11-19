import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { PLAYLIST_NAME_MAX, type SavedPlaylist } from '../../src/shared/types'
import { expectNoEvent, TestServer, waitFor, type ClientSocket, type TestUser } from './helpers'

const SPOTIFY_PLAYLIST = 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'
const SPOTIFY_ALBUM = 'https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy'
const SPOTIFY_TRACK = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'
const YOUTUBE_PLAYLIST = 'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
const INVALID_LINK = 'Envie o link de uma playlist ou álbum do Spotify ou do YouTube'

let server: TestServer
let owner: TestUser
const open: ClientSocket[] = []
let n = 0

beforeAll(async () => {
  server = await TestServer.start()
  owner = await server.asOwner()
})

afterEach(() => {
  for (const s of open.splice(0)) s.close()
})

afterAll(async () => {
  await server?.destroy()
})

async function user(name?: string): Promise<TestUser> {
  const u = await server.newUser(name)
  open.push(u.socket)
  return u
}

const uniqueLink = (): string => `https://open.spotify.com/playlist/${String(++n).padStart(22, 'A')}`

async function save(u: TestUser, name: string, url: string) {
  return u.socket.emitWithAck('playlist:create', { name, url })
}

async function saved(u: TestUser, name = `Lista ${++n}`, url = uniqueLink()): Promise<SavedPlaylist> {
  const res = await save(u, name, url)
  if (!res.ok) throw new Error(res.error)
  return res.playlist
}

describe('playlist:create', () => {
  it('salva playlist e álbum do Spotify e playlist do YouTube, com o tipo decidido pelo servidor', async () => {
    const a = await user('Ana')
    const playlist = await saved(a, 'Treino', SPOTIFY_PLAYLIST)
    const album = await saved(a, 'Clássico', SPOTIFY_ALBUM)
    const youtube = await saved(a, 'Vídeos', YOUTUBE_PLAYLIST)
    expect(playlist).toMatchObject({ name: 'Treino', kind: 'playlist', savedBy: { accountId: a.account.id, name: 'Ana' } })
    expect(album.kind).toBe('album')
    expect(youtube.kind).toBe('playlist')
    expect(new Date(playlist.createdAt).getTime()).not.toBeNaN()
  })

  it('recusa faixa avulsa, texto de busca e link de outro site', async () => {
    const a = await user()
    for (const url of [SPOTIFY_TRACK, 'rock dos anos 80', 'https://example.com/playlist/1', '']) {
      expect(await save(a, `Nome ${++n}`, url)).toEqual({ ok: false, error: INVALID_LINK })
    }
    expect(await a.socket.emitWithAck('playlist:create', { name: 'x', url: 42 } as never)).toEqual({ ok: false, error: INVALID_LINK })
  })

  it('recusa nome vazio, só espaços, longo demais ou que não é texto', async () => {
    const a = await user()
    const error = `Dê um nome à playlist (até ${PLAYLIST_NAME_MAX} caracteres)`
    expect(await save(a, '', uniqueLink())).toEqual({ ok: false, error })
    expect(await save(a, '   ', uniqueLink())).toEqual({ ok: false, error })
    expect(await save(a, 'x'.repeat(PLAYLIST_NAME_MAX + 1), uniqueLink())).toEqual({ ok: false, error })
    expect(await a.socket.emitWithAck('playlist:create', { name: 7, url: uniqueLink() } as never)).toEqual({ ok: false, error })
    expect((await save(a, `  ${'x'.repeat(PLAYLIST_NAME_MAX)}  `, uniqueLink())).ok).toBe(true)
  })

  it('recusa nome repetido sem diferenciar maiúsculas', async () => {
    const a = await user()
    await saved(a, 'Churrasco')
    expect(await save(a, 'churrasco', uniqueLink())).toEqual({ ok: false, error: 'Já existe uma playlist salva com esse nome' })
  })

  it('recusa o mesmo link duas vezes, mesmo escrito de outro jeito, dizendo qual playlist já o tem', async () => {
    const a = await user()
    const first = await saved(a, `Original ${++n}`, 'https://open.spotify.com/playlist/AAAAAAAAAAAAAAAAAAAAAA')
    expect(await save(a, `Cópia ${++n}`, 'https://open.spotify.com/intl-pt/playlist/AAAAAAAAAAAAAAAAAAAAAA?si=abc')).toEqual({
      ok: false,
      error: `Esse link já está salvo em "${first.name}"`
    })
    expect((await save(a, `Cópia ${++n}`, 'spotify:playlist:AAAAAAAAAAAAAAAAAAAAAA')).ok).toBe(false)
  })

  it('avisa todos os conectados, inclusive quem não criou', async () => {
    const a = await user()
    const b = await user()
    const created = waitFor(b.socket, 'playlist:created', (p) => p.name === 'Para todos')
    const playlist = await saved(a, 'Para todos')
    expect((await created)[0]).toEqual(playlist)
  })
})

describe('playlist:list', () => {
  it('devolve todas as playlists da comunidade para qualquer conta', async () => {
    const a = await user()
    const b = await user()
    const one = await saved(a)
    const two = await saved(b)
    const res = await user().then((c) => c.socket.emitWithAck('playlist:list'))
    if (!res.ok) throw new Error(res.error)
    const ids = res.playlists.map((p) => p.id)
    expect(ids).toEqual(expect.arrayContaining([one.id, two.id]))
  })
})

describe('playlist:delete', () => {
  it('quem salvou apaga e todos são avisados', async () => {
    const a = await user()
    const b = await user()
    const playlist = await saved(a)
    const deleted = waitFor(b.socket, 'playlist:deleted', (p) => p.id === playlist.id)
    expect(await a.socket.emitWithAck('playlist:delete', playlist.id)).toEqual({ ok: true })
    await deleted
    const list = await b.socket.emitWithAck('playlist:list')
    expect(list.ok && list.playlists.some((p) => p.id === playlist.id)).toBe(false)
  })

  it('outra pessoa comum não apaga e ninguém é avisado', async () => {
    const a = await user()
    const b = await user()
    const playlist = await saved(a)
    const silent = expectNoEvent(a.socket, 'playlist:deleted')
    expect(await b.socket.emitWithAck('playlist:delete', playlist.id)).toEqual({
      ok: false,
      error: 'Só quem salvou (ou quem gerencia mensagens) pode apagar esta playlist'
    })
    await silent
  })

  it('quem gerencia mensagens apaga a de outra pessoa', async () => {
    const a = await user()
    const mod = await user('Moderadora')
    const playlist = await saved(a)
    const role = await owner.socket.emitWithAck('role:create', { name: `Mod ${++n}`, color: null, permissions: ['manageMessages'] })
    if (!role.ok) throw new Error(role.error)
    await owner.socket.emitWithAck('member:set-roles', { accountId: mod.account.id, roleIds: [role.role.id] })
    expect(await mod.socket.emitWithAck('playlist:delete', playlist.id)).toEqual({ ok: true })
  })

  it('id inexistente ou inválido volta "não encontrada"', async () => {
    const a = await user()
    const error = 'Playlist não encontrada'
    expect(await a.socket.emitWithAck('playlist:delete', 'nao-e-uuid')).toEqual({ ok: false, error })
    expect(await a.socket.emitWithAck('playlist:delete', '00000000-0000-4000-8000-000000000000')).toEqual({ ok: false, error })
  })
})

describe('limite de criação', () => {
  it('3 seguidas passam, a 4ª é recusada com aviso', async () => {
    const limited = await TestServer.start({ env: { RATE_LIMIT_MULTIPLIER: '1' }, owner: false })
    try {
      const a = await limited.newUser('Apressada')
      open.push(a.socket)
      for (let i = 0; i < 3; i++) expect((await save(a, `Rápida ${i}`, uniqueLink())).ok).toBe(true)
      const res = await save(a, 'Rápida 4', uniqueLink())
      expect(res.ok).toBe(false)
      expect(!res.ok && res.error).toMatch(/Muitas playlists seguidas/)
    } finally {
      await limited.destroy()
    }
  }, 60_000)
})
