import { describe, expect, it } from 'vitest'
import { parseMusicQuery } from './query'

const TRACK = '4uLU6hMCjMI75M1A2tKUQC'
const PLAYLIST = '3cEYpjA9oz9GiPac4AsH4n'
const VIDEO = 'dQw4w9WgXcQ'
const LIST = 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'

describe('parseMusicQuery', () => {
  it.each([
    [`https://open.spotify.com/track/${TRACK}`, 'track', TRACK],
    [`https://open.spotify.com/track/${TRACK}?si=abc123`, 'track', TRACK],
    [`https://open.spotify.com/intl-pt/track/${TRACK}`, 'track', TRACK],
    [`https://open.spotify.com/intl-pt-br/track/${TRACK}?si=x`, 'track', TRACK],
    [`http://open.spotify.com/track/${TRACK}/`, 'track', TRACK],
    [`  spotify:track:${TRACK}  `, 'track', TRACK],
    [`open.spotify.com/track/${TRACK}`, 'track', TRACK],
    [`https://open.spotify.com/playlist/${PLAYLIST}?si=1`, 'playlist', PLAYLIST],
    [`https://open.spotify.com/intl-es/playlist/${PLAYLIST}`, 'playlist', PLAYLIST],
    [`spotify:playlist:${PLAYLIST}`, 'playlist', PLAYLIST],
    [`https://open.spotify.com/album/${TRACK}`, 'album', TRACK],
    [`spotify:album:${TRACK}`, 'album', TRACK]
  ])('Spotify: %s', (text, type, id) => {
    expect(parseMusicQuery(text)).toEqual({ kind: 'spotify', type, id })
  })

  it.each([
    [`https://www.youtube.com/watch?v=${VIDEO}`],
    [`https://youtube.com/watch?v=${VIDEO}&t=42s`],
    [`https://m.youtube.com/watch?v=${VIDEO}`],
    [`https://music.youtube.com/watch?v=${VIDEO}&si=x`],
    [`https://youtu.be/${VIDEO}?si=abc`],
    [`https://www.youtube.com/shorts/${VIDEO}`],
    [`https://www.youtube.com/watch?v=${VIDEO}&list=${LIST}&index=3`],
    [`www.youtube.com/watch?v=${VIDEO}`],
    [`youtu.be/${VIDEO}`]
  ])('vídeo do YouTube: %s', (text) => {
    expect(parseMusicQuery(text)).toEqual({ kind: 'youtube-video', id: VIDEO })
  })

  it.each([
    [`https://www.youtube.com/playlist?list=${LIST}`],
    [`https://music.youtube.com/playlist?list=${LIST}&si=x`],
    [`youtube.com/playlist?list=${LIST}`]
  ])('playlist do YouTube: %s', (text) => {
    expect(parseMusicQuery(text)).toEqual({ kind: 'youtube-playlist', id: LIST })
  })

  it.each([
    ['Garota de Ipanema', 'Garota de Ipanema'],
    ['  tom jobim   águas de março  ', 'tom jobim águas de março'],
    ['Mr. Brightside', 'Mr. Brightside'],
    ['-v --exec rm', '-v --exec rm'],
    ['AC/DC Back in Black', 'AC/DC Back in Black'],
    ['linha\nquebrada', 'linha quebrada']
  ])('texto livre vira busca: %j', (text, search) => {
    expect(parseMusicQuery(text)).toEqual({ kind: 'search', text: search })
  })

  it.each([
    ['https://soundcloud.com/artista/musica'],
    ['https://www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ'],
    [`https://evil.com/open.spotify.com/track/${TRACK}`],
    [`https://user@open.spotify.com/track/${TRACK}`],
    [`https://open.spotify.com:8443/track/${TRACK}`],
    [`ftp://open.spotify.com/track/${TRACK}`],
    [`https://open.spotify.com/xx/track/${TRACK}`],
    ['https://open.spotify.com/artist/0TnOYISbd1XYRBk9myaseg'],
    ['https://open.spotify.com/track/curto'],
    ['spotify:track:curto'],
    ['spotify:artist:0TnOYISbd1XYRBk9myaseg'],
    ['https://www.youtube.com/watch?v=curto'],
    ['https://www.youtube.com/@canal'],
    ['https://www.youtube.com/playlist'],
    [`https://youtu.be/${VIDEO}/extra`],
    ['pt.wikipedia.org/wiki/Bossa_nova'],
    ['file:///C:/musica.mp3'],
    [''],
    ['   ']
  ])('recusa %j', (text) => {
    expect(parseMusicQuery(text)).toBeNull()
  })
})
