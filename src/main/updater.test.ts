// Atualização automática no processo principal (A13), com um atualizador falso: o que vai para a
// janela em cada etapa, dev não procura, verificação periódica e instalar só com a versão baixada.
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '../shared/updater'

vi.mock('electron', () => ({ app: {}, ipcMain: {} }))

const { createUpdaterController, pickAutoUpdater } = await import('./updater')

class FakeUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  checkForUpdates = vi.fn(async () => undefined)
  quitAndInstall = vi.fn()
}

function setup(isPackaged = true) {
  const updater = new FakeUpdater()
  const sent: UpdateStatus[] = []
  const timers: Array<{ fn: () => void; ms: number }> = []
  const log = vi.fn()
  const controller = createUpdaterController({
    updater: updater as never,
    isPackaged,
    send: (s) => sent.push(s),
    setInterval: (fn, ms) => timers.push({ fn, ms }),
    log
  })
  return { updater, sent, timers, log, controller }
}

describe('createUpdaterController', () => {
  it('liga o download automático e a instalação ao fechar', () => {
    const { updater } = setup()
    expect([updater.autoDownload, updater.autoInstallOnAppQuit]).toEqual([true, true])
  })

  it('app instalado: procura ao abrir e a cada 30 min', () => {
    const { updater, timers, controller } = setup()
    controller.start()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(timers.map((t) => t.ms)).toEqual([30 * 60 * 1000])
    timers[0].fn()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('modo dev: não procura', () => {
    const { updater, timers, controller } = setup(false)
    controller.start()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(timers).toEqual([])
  })

  it('procurar agora (botão): app instalado procura na hora', () => {
    const { updater, controller } = setup()
    controller.checkNow()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('procurar agora em modo dev: não procura e avisa que só funciona no instalado', () => {
    const { updater, sent, controller } = setup(false)
    controller.checkNow()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(sent).toEqual([{ state: 'error', message: 'A atualização só funciona no app instalado.' }])
  })

  it('etapas: procurando → baixando (com %) → pronta; depois de pronta não volta', () => {
    const { updater, sent, controller } = setup()
    updater.emit('checking-for-update')
    updater.emit('update-available', { version: '1.2.0' })
    updater.emit('download-progress', { percent: 42.6 })
    updater.emit('download-progress', { percent: 130 })
    updater.emit('update-downloaded', { version: '1.2.0' })
    updater.emit('checking-for-update')
    expect(sent).toEqual([
      { state: 'checking' },
      { state: 'downloading', version: '1.2.0', percent: 0 },
      { state: 'downloading', version: '1.2.0', percent: 43 },
      { state: 'downloading', version: '1.2.0', percent: 100 },
      { state: 'ready', version: '1.2.0' }
    ])
    expect(controller.status()).toEqual({ state: 'ready', version: '1.2.0' })
  })

  it('sem versão nova volta a "nada"; erro avisa com texto amigável e loga o motivo', () => {
    const { updater, sent, log } = setup()
    updater.emit('checking-for-update')
    updater.emit('update-not-available')
    updater.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'))
    expect(sent.slice(1)).toEqual([{ state: 'idle' }, { state: 'error', message: 'Não foi possível procurar atualizações agora.' }])
    expect(log).toHaveBeenCalledWith('[atualização] net::ERR_INTERNET_DISCONNECTED')
  })

  it('verificação que falha (promessa) só loga', async () => {
    const { updater, controller, log } = setup()
    updater.checkForUpdates.mockRejectedValueOnce(new Error('404'))
    controller.start()
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith('[atualização] 404'))
  })

  it('instalar só com a versão já baixada, em silêncio e abrindo o app de novo', () => {
    const { updater, controller } = setup()
    controller.install()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    updater.emit('update-downloaded', { version: '2.0.0' })
    controller.install()
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1)
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true)
  })
})

describe('pickAutoUpdater (interop com o electron-updater, que é CommonJS)', () => {
  it('acha o autoUpdater como export nomeado ou só no default (import() no main ESM)', () => {
    const updater = new FakeUpdater()
    expect(pickAutoUpdater({ autoUpdater: updater })).toBe(updater)
    expect(pickAutoUpdater({ autoUpdater: undefined, default: { autoUpdater: updater } })).toBe(updater)
  })

  it('módulo sem autoUpdater: erro claro em vez de "Cannot set properties of undefined"', () => {
    expect(() => pickAutoUpdater({ default: {} })).toThrow('electron-updater sem autoUpdater')
    expect(() => pickAutoUpdater(null)).toThrow('electron-updater sem autoUpdater')
  })
})
