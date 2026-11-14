// Controlador do compartilhamento de tela no processo principal (sem Electron de verdade).
import type { DesktopCapturerSource } from 'electron'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ desktopCapturer: {}, ipcMain: {}, session: {} }))

const { createScreenShareController } = await import('./screen-share')

function image(data: string, empty = false) {
  return { toDataURL: () => `data:image/png;base64,${data}`, isEmpty: () => empty }
}

function source(id: string, name: string, appIcon: ReturnType<typeof image> | null = null): DesktopCapturerSource {
  return { id, name, thumbnail: image(id), appIcon, display_id: '' } as unknown as DesktopCapturerSource
}

const SOURCES = [
  source('screen:0:0', 'Tela 1'),
  source('window:42:0', 'Bloco de notas', image('icone')),
  source('window:43:0', 'Sem ícone', image('', true))
]

function setup(canShareAudio = true) {
  let now = 1_000
  const deps = { getSources: vi.fn(async () => SOURCES), now: () => now, canShareAudio }
  return { controller: createScreenShareController(deps), deps, advance: (ms: number) => (now += ms) }
}

describe('listSources', () => {
  it('separa telas de janelas e converte as imagens', async () => {
    const { controller } = setup()
    expect(await controller.listSources()).toEqual([
      { id: 'screen:0:0', name: 'Tela 1', kind: 'screen', thumbnail: 'data:image/png;base64,screen:0:0', appIcon: null },
      {
        id: 'window:42:0',
        name: 'Bloco de notas',
        kind: 'window',
        thumbnail: 'data:image/png;base64,window:42:0',
        appIcon: 'data:image/png;base64,icone'
      },
      { id: 'window:43:0', name: 'Sem ícone', kind: 'window', thumbnail: 'data:image/png;base64,window:43:0', appIcon: null }
    ])
  })
})

describe('select + takeStreams', () => {
  it('entrega a fonte escolhida uma única vez', async () => {
    const { controller } = setup()
    await controller.listSources()
    controller.select('window:42:0', false)
    expect(controller.takeStreams()).toEqual({ video: SOURCES[1] })
    expect(controller.takeStreams()).toBeNull()
  })

  it('com áudio, usa o loopback do sistema', async () => {
    const { controller } = setup()
    await controller.listSources()
    controller.select('screen:0:0', true)
    expect(controller.takeStreams()).toEqual({ video: SOURCES[0], audio: 'loopback' })
  })

  it('ignora o pedido de áudio onde o sistema não suporta', async () => {
    const { controller } = setup(false)
    await controller.listSources()
    controller.select('screen:0:0', true)
    expect(controller.takeStreams()).toEqual({ video: SOURCES[0] })
  })

  it('só aceita fontes da última listagem (o renderer não inventa ids)', async () => {
    const { controller } = setup()
    expect(() => controller.select('screen:0:0', false)).toThrow('não está mais disponível')
    await controller.listSources()
    expect(() => controller.select('window:999:0', false)).toThrow('não está mais disponível')
    expect(() => controller.select(42, false)).toThrow()
    expect(controller.takeStreams()).toBeNull()
  })

  it('áudio só vale se vier exatamente true', async () => {
    const { controller } = setup()
    await controller.listSources()
    controller.select('screen:0:0', 'sim')
    expect(controller.takeStreams()).toEqual({ video: SOURCES[0] })
  })

  it('sem escolha, recusa o getDisplayMedia', () => {
    expect(setup().controller.takeStreams()).toBeNull()
  })

  it('escolha velha (mais de 15 s) é descartada', async () => {
    const { controller, advance } = setup()
    await controller.listSources()
    controller.select('screen:0:0', false)
    advance(15_001)
    expect(controller.takeStreams()).toBeNull()
  })
})
