import { MusicError } from '../music/ports'
import { YOUTUBE_UNAVAILABLE } from '../music/youtube'

export const FAKE_YOUTUBE = {
  video: 'vidOK000001',
  live: 'vidLIVE0001',
  long: 'vidLONG0001',
  playlist: 'PLtresboas',
  bigPlaylist: 'PLgrande150',
  bigPlaylistSize: 150,
  search: 'garota de ipanema',
  nothing: 'nada encontrado aqui'
}

const video = (id: string, title: string, seconds: number | null, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  title,
  duration: seconds,
  channel: 'Canal Teste',
  thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/hq.jpg` }],
  live_status: null,
  ...extra
})

export function fakeYtDlp(args: string[]): unknown {
  const target = args.at(-1) ?? ''
  const watch = 'https://www.youtube.com/watch?v='
  const playlist = 'https://www.youtube.com/playlist?list='
  if (target === `${watch}${FAKE_YOUTUBE.video}`) return { ...video(FAKE_YOUTUBE.video, 'Vídeo do YouTube', 180), webpage_url: target }
  if (target === `${watch}${FAKE_YOUTUBE.live}`) return video(FAKE_YOUTUBE.live, 'Ao vivo agora', null, { is_live: true, live_status: 'is_live' })
  if (target === `${watch}${FAKE_YOUTUBE.long}`) return video(FAKE_YOUTUBE.long, 'Show inteiro', 2 * 60 * 60)
  if (target === `${playlist}${FAKE_YOUTUBE.playlist}`) {
    return {
      title: 'Playlist do YouTube',
      entries: [
        video('pl000000001', 'Primeira', 200),
        video('pl000000002', '[Private video]', null),
        video('pl000000003', 'Segunda', 210),
        video('pl000000004', 'Longa demais', 60 * 60),
        video('pl000000005', 'Terceira', 220)
      ]
    }
  }
  if (target === `${playlist}${FAKE_YOUTUBE.bigPlaylist}`) {
    return { entries: Array.from({ length: FAKE_YOUTUBE.bigPlaylistSize }, (_, i) => video(`big${String(i).padStart(8, '0')}`, `Faixa ${i + 1}`, 540)) }
  }
  if (target === `ytsearch1:${FAKE_YOUTUBE.search}`) return { entries: [video('busca000001', 'Garota de Ipanema (ao vivo no estúdio)', 240)] }
  if (target === `ytsearch1:${FAKE_YOUTUBE.nothing}`) return { entries: [] }
  throw new MusicError(YOUTUBE_UNAVAILABLE)
}

