import { describe, expect, it } from 'vitest'
import type { MusicState } from '@shared/types'
import { playbackElapsedMs } from './music-progress'

const state = (over: Partial<MusicState> = {}): MusicState => ({
  channelId: 'sala',
  nowPlaying: {
    id: 't1',
    title: 'Garota de Ipanema',
    artists: ['Tom Jobim'],
    coverUrl: null,
    durationMs: 180_000,
    url: 'https://open.spotify.com/track/t1',
    requestedBy: { accountId: 'acc-ana', name: 'Ana' }
  },
  queue: [],
  paused: false,
  elapsedMs: 30_000,
  ...over
})

describe('playbackElapsedMs', () => {
  it('tocando: soma o tempo desde que o estado chegou', () => {
    expect(playbackElapsedMs(state(), 1_000, 6_000)).toBe(35_000)
  })

  it('pausada: fica no elapsedMs', () => {
    expect(playbackElapsedMs(state({ paused: true }), 1_000, 60_000)).toBe(30_000)
  })

  it('nunca passa da duração nem volta antes do elapsedMs', () => {
    expect(playbackElapsedMs(state(), 0, 10_000_000)).toBe(180_000)
    expect(playbackElapsedMs(state(), 5_000, 1_000)).toBe(30_000)
  })
})
