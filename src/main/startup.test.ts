import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, ipcMain: {} }))

const { createStartupController, fileMarker, supportsOpenAtLogin } = await import('./startup')

function fakeLoginItems(initial = false) {
  const state = { openAtLogin: initial, writes: [] as boolean[] }
  return {
    state,
    loginItems: {
      get: () => state.openAtLogin,
      set: (openAtLogin: boolean) => {
        state.openAtLogin = openAtLogin
        state.writes.push(openAtLogin)
      }
    }
  }
}

function fakeMarker(applied = false) {
  const state = { applied }
  return { state, marker: { applied: () => state.applied, markApplied: () => void (state.applied = true) } }
}

describe('supportsOpenAtLogin', () => {
  it('só no Windows com o app instalado', () => {
    expect(supportsOpenAtLogin('win32', true)).toBe(true)
    expect(supportsOpenAtLogin('win32', false)).toBe(false)
    expect(supportsOpenAtLogin('darwin', true)).toBe(false)
    expect(supportsOpenAtLogin('linux', true)).toBe(false)
  })
})

describe('createStartupController', () => {
  it('primeira execução: liga o iniciar com o Windows e marca que o padrão já foi aplicado', () => {
    const items = fakeLoginItems(false)
    const mark = fakeMarker(false)
    const controller = createStartupController({ supported: true, loginItems: items.loginItems, marker: mark.marker })
    controller.applyDefault()
    expect(items.state.openAtLogin).toBe(true)
    expect(mark.state.applied).toBe(true)
    expect(controller.get()).toBe(true)
  })

  it('depois de a pessoa desligar, reabrir ou atualizar não liga de novo', () => {
    const items = fakeLoginItems(false)
    const mark = fakeMarker(false)
    createStartupController({ supported: true, loginItems: items.loginItems, marker: mark.marker }).applyDefault()
    const controller = createStartupController({ supported: true, loginItems: items.loginItems, marker: mark.marker })
    expect(controller.set(false)).toBe(false)
    createStartupController({ supported: true, loginItems: items.loginItems, marker: mark.marker }).applyDefault()
    expect(items.state.openAtLogin).toBe(false)
    expect(items.state.writes).toEqual([true, false])
  })

  it('a escolha da pessoa vale e volta como o sistema ficou; valor que não é booleano não muda nada', () => {
    const items = fakeLoginItems(true)
    const controller = createStartupController({ supported: true, loginItems: items.loginItems, marker: fakeMarker(true).marker })
    expect(controller.set(false)).toBe(false)
    expect(controller.set(true)).toBe(true)
    expect(controller.set('sim')).toBe(true)
    expect(items.state.writes).toEqual([false, true])
  })

  it('sem suporte (dev, macOS, Linux): não registra nada e responde null', () => {
    const items = fakeLoginItems(false)
    const mark = fakeMarker(false)
    const controller = createStartupController({ supported: false, loginItems: items.loginItems, marker: mark.marker })
    controller.applyDefault()
    expect(controller.get()).toBeNull()
    expect(controller.set(true)).toBeNull()
    expect(items.state.writes).toEqual([])
    expect(mark.state.applied).toBe(false)
  })
})

describe('fileMarker', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('guarda em arquivo que o padrão já foi aplicado e lembra numa nova instância', () => {
    dir = mkdtempSync(join(tmpdir(), 'concord-startup-'))
    const path = join(dir, 'startup-default-applied')
    expect(fileMarker(path).applied()).toBe(false)
    fileMarker(path).markApplied()
    expect(fileMarker(path).applied()).toBe(true)
  })
})
