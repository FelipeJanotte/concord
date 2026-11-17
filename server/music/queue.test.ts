import { describe, expect, it } from 'vitest'
import type { QueuedTrack } from './ports'
import { advance, EMPTY_QUEUE, enqueue, type RoomQueue } from './queue'

const track = (id: string): QueuedTrack => ({
  id,
  title: `Música ${id}`,
  artists: ['Banda'],
  coverUrl: null,
  durationMs: 180_000,
  url: `https://open.spotify.com/track/${id}`,
  audio: { kind: 'youtube-search', query: `Banda - Música ${id}` },
  requestedBy: { accountId: 'acc', name: 'Ana' }
})

function queued(result: ReturnType<typeof enqueue>): RoomQueue {
  if (!result.ok) throw new Error(result.error)
  return result.queue
}

describe('enqueue', () => {
  it('a primeira música vai direto para "tocando agora"', () => {
    expect(enqueue(EMPTY_QUEUE, [track('a')])).toEqual({ ok: true, queue: { nowPlaying: track('a'), upcoming: [] }, added: 1 })
  })

  it('as próximas entram no fim da fila, na ordem', () => {
    const q = queued(enqueue(queued(enqueue(EMPTY_QUEUE, [track('a')])), [track('b'), track('c')]))
    expect(q.nowPlaying?.id).toBe('a')
    expect(q.upcoming.map((t) => t.id)).toEqual(['b', 'c'])
  })

  it('várias de uma vez na sala vazia: a primeira toca, o resto espera', () => {
    const res = enqueue(EMPTY_QUEUE, [track('a'), track('b'), track('c')])
    expect(res.ok && res.added).toBe(3)
    expect(queued(res)).toEqual({ nowPlaying: track('a'), upcoming: [track('b'), track('c')] })
  })

  it('entra só o que cabe e diz quantas entraram', () => {
    const res = enqueue(queued(enqueue(EMPTY_QUEUE, [track('a'), track('b')])), [track('c'), track('d'), track('e')], 2)
    expect(res.ok && res.added).toBe(1)
    expect(queued(res).upcoming.map((t) => t.id)).toEqual(['b', 'c'])
  })

  it('recusa quando a fila (sem contar a que toca) está cheia', () => {
    const full = queued(enqueue(EMPTY_QUEUE, [track('a'), track('b'), track('c')], 2))
    expect(enqueue(full, [track('d')], 2)).toEqual({ ok: false, error: 'A fila está cheia (máximo de 2 músicas)' })
  })

  it('não muda a fila recebida', () => {
    const q = queued(enqueue(EMPTY_QUEUE, [track('a')]))
    enqueue(q, [track('b')])
    expect(q.upcoming).toEqual([])
  })
})

describe('advance', () => {
  it('passa para a próxima da fila', () => {
    const q = advance({ nowPlaying: track('a'), upcoming: [track('b'), track('c')] })
    expect(q.nowPlaying?.id).toBe('b')
    expect(q.upcoming.map((t) => t.id)).toEqual(['c'])
  })

  it('fila vazia: nada tocando', () => {
    expect(advance({ nowPlaying: track('a'), upcoming: [] })).toEqual(EMPTY_QUEUE)
  })
})
