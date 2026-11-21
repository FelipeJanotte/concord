import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SCREEN_QUALITY } from '@shared/screen'
import { voice } from '@/lib/voice'
import { initialState, useApp } from '@/store'
import { chooseScreenQuality, loadScreenQuality } from './screen-quality'

const KEY = 'concord:screen-quality'
let storage: Map<string, string>

beforeEach(() => {
  useApp.setState({ ...initialState })
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v)
  })
  vi.spyOn(voice, 'setScreenQuality').mockResolvedValue()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('qualidade da tela', () => {
  it('sem nada guardado usa o padrão', () => {
    expect(loadScreenQuality()).toEqual(DEFAULT_SCREEN_QUALITY)
  })

  it('a escolha fica guardada na máquina e vai para a store', async () => {
    await chooseScreenQuality({ resolution: '720p', fps: 60 })
    expect(JSON.parse(storage.get(KEY)!)).toEqual({ resolution: '720p', fps: 60 })
    expect(loadScreenQuality()).toEqual({ resolution: '720p', fps: 60 })
    expect(useApp.getState().screenQuality).toEqual({ resolution: '720p', fps: 60 })
  })

  it('com a tela no ar troca a captura sem parar', async () => {
    useApp.setState({ sharing: true })
    await chooseScreenQuality({ resolution: '1440p', fps: 30 })
    expect(voice.setScreenQuality).toHaveBeenCalledWith({ resolution: '1440p', fps: 30 })
  })

  it('sem tela no ar só guarda', async () => {
    await chooseScreenQuality({ resolution: '1440p', fps: 30 })
    expect(voice.setScreenQuality).not.toHaveBeenCalled()
  })

  it('valor guardado estragado volta ao padrão', () => {
    storage.set(KEY, '{quebrado')
    expect(loadScreenQuality()).toEqual(DEFAULT_SCREEN_QUALITY)
  })
})
