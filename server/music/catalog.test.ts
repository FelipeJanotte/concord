import { describe, expect, it, vi } from 'vitest'
import { MusicCatalog } from './catalog'
import { MusicError, type MusicQuery, type TrackMetadata, type TrackResolver } from './ports'
import type { SpotifyQuery } from './spotify'
import type { YouTubeQuery } from './youtube'

const meta = (title: string, extra: Partial<TrackMetadata> = {}): TrackMetadata => ({
  title,
  artists: ['Banda'],
  coverUrl: null,
  durationMs: 180_000,
  url: `https://www.youtube.com/watch?v=${title}`,
  live: false,
  audio: { kind: 'audio-url', url: `https://www.youtube.com/watch?v=${title}` },
  ...extra
})

function resolver<Q extends MusicQuery>(reply: (q: Q) => TrackMetadata[] | Error, collectionTitle: string | null = null): TrackResolver<Q> & { seen: Q[] } {
  const seen: Q[] = []
  return {
    seen,
    async resolve(q) {
      seen.push(q)
      const out = reply(q)
      if (out instanceof Error) throw out
      return { tracks: out, collectionTitle }
    }
  }
}

const LONG = 20 * 60_000

describe('MusicCatalog', () => {
  it('escolhe o resolvedor pelo tipo da consulta', async () => {
    const spotify = resolver<SpotifyQuery>(() => [meta('do spotify')])
    const youtube = resolver<YouTubeQuery>(() => [meta('do youtube')])
    const catalog = new MusicCatalog(spotify, youtube)
    expect(await catalog.find('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC')).toEqual({ ok: true, tracks: [meta('do spotify')], collection: null })
    expect(await catalog.find('https://youtu.be/dQw4w9WgXcQ')).toEqual({ ok: true, tracks: [meta('do youtube')], collection: null })
    expect(await catalog.find('garota de ipanema')).toEqual({ ok: true, tracks: [meta('do youtube')], collection: null })
    expect(spotify.seen).toEqual([{ kind: 'spotify', type: 'track', id: '4uLU6hMCjMI75M1A2tKUQC' }])
    expect(youtube.seen).toEqual([
      { kind: 'youtube-video', id: 'dQw4w9WgXcQ' },
      { kind: 'search', text: 'garota de ipanema' }
    ])
  })

  it('link de outro site: recusa sem consultar ninguém', async () => {
    const youtube = resolver<YouTubeQuery>(() => [meta('x')])
    expect(await new MusicCatalog(null, youtube).find('https://soundcloud.com/a/b')).toEqual({
      ok: false,
      error: 'Envie o nome da música ou um link do Spotify ou do YouTube'
    })
    expect(youtube.seen).toEqual([])
  })

  it('Spotify sem credenciais: link do Spotify recusado, YouTube continua', async () => {
    const catalog = new MusicCatalog(null, resolver<YouTubeQuery>(() => [meta('x')]))
    expect(await catalog.find('spotify:playlist:3cEYpjA9oz9GiPac4AsH4n')).toEqual({
      ok: false,
      error: 'Links do Spotify não estão configurados neste servidor'
    })
    expect((await catalog.find('qualquer coisa')).ok).toBe(true)
  })

  it('item único ao vivo, sem duração ou longo demais: recusa com o motivo', async () => {
    const answer = { current: meta('x') }
    const catalog = new MusicCatalog(null, resolver<YouTubeQuery>(() => [answer.current]))
    answer.current = meta('ao vivo', { live: true, durationMs: 0 })
    expect(await catalog.find('https://youtu.be/dQw4w9WgXcQ')).toEqual({ ok: false, error: 'Transmissões ao vivo não podem ser tocadas' })
    answer.current = meta('sem duração', { durationMs: 0 })
    expect(await catalog.find('https://youtu.be/dQw4w9WgXcQ')).toEqual({ ok: false, error: 'Não foi possível saber a duração dessa música' })
    answer.current = meta('longa', { durationMs: LONG })
    expect(await catalog.find('https://youtu.be/dQw4w9WgXcQ')).toEqual({ ok: false, error: 'Música longa demais (máximo de 15 min)' })
  })

  it('playlist: pula ao vivo, sem duração e longas demais', async () => {
    const youtube = resolver<YouTubeQuery>(() => [
      meta('boa 1'),
      meta('ao vivo', { live: true }),
      meta('privado', { durationMs: 0 }),
      meta('longa', { durationMs: LONG }),
      meta('boa 2')
    ])
    const found = await new MusicCatalog(null, youtube).find('https://www.youtube.com/playlist?list=PLabc')
    expect(found.ok && found.tracks.map((t) => t.title)).toEqual(['boa 1', 'boa 2'])
  })

  it('playlist e álbum: devolve o título da coleção e o link canônico', async () => {
    const spotify = resolver<SpotifyQuery>(() => [meta('a')], 'Disco')
    const youtube = resolver<YouTubeQuery>(() => [meta('b')], 'Minha lista')
    const catalog = new MusicCatalog(spotify, youtube)
    const album = await catalog.find('  https://open.spotify.com/intl-pt/album/4uLU6hMCjMI75M1A2tKUQC?si=x ')
    expect(album.ok && album.collection).toEqual({ kind: 'album', title: 'Disco', url: 'https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC' })
    const playlist = await catalog.find('spotify:playlist:3cEYpjA9oz9GiPac4AsH4n')
    expect(playlist.ok && playlist.collection).toMatchObject({ kind: 'playlist', url: 'https://open.spotify.com/playlist/3cEYpjA9oz9GiPac4AsH4n' })
    const listed = await catalog.find('https://www.youtube.com/playlist?list=PLabc&si=1')
    expect(listed.ok && listed.collection).toEqual({ kind: 'playlist', title: 'Minha lista', url: 'https://www.youtube.com/playlist?list=PLabc' })
  })

  it('coleção sem título nos metadados: usa o link como título', async () => {
    const found = await new MusicCatalog(null, resolver<YouTubeQuery>(() => [meta('b')])).find('https://www.youtube.com/playlist?list=PLabc')
    expect(found.ok && found.collection?.title).toBe('https://www.youtube.com/playlist?list=PLabc')
  })

  it('playlist sem nenhuma música tocável: erro', async () => {
    const youtube = resolver<YouTubeQuery>(() => [meta('longa', { durationMs: LONG })])
    expect(await new MusicCatalog(null, youtube).find('https://www.youtube.com/playlist?list=PLabc')).toEqual({
      ok: false,
      error: 'Nenhuma música da lista pode ser tocada (ao vivo, sem duração ou acima de 15 min)'
    })
  })

  it('erro do resolvedor vira mensagem; erro inesperado vira mensagem genérica', async () => {
    const known = new MusicCatalog(null, resolver<YouTubeQuery>(() => new MusicError('Nada encontrado no YouTube para "x"')))
    expect(await known.find('x')).toEqual({ ok: false, error: 'Nada encontrado no YouTube para "x"' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = new MusicCatalog(null, resolver<YouTubeQuery>(() => new TypeError('boom')))
    expect(await broken.find('x')).toEqual({ ok: false, error: 'Não foi possível buscar a música. Tente de novo.' })
    vi.restoreAllMocks()
  })
})
