import { describe, expect, it } from 'vitest'
import { isActivityStatus, presenceStatus } from './presence'

describe('presenceStatus', () => {
  it('Não perturbe vale por cima de tudo', () => {
    expect(presenceStatus(true, [false])).toBe('dnd')
    expect(presenceStatus(true, [true, true])).toBe('dnd')
  })

  it('ausente só quando todas as conexões da conta estão paradas', () => {
    expect(presenceStatus(false, [true])).toBe('idle')
    expect(presenceStatus(false, [true, true])).toBe('idle')
    expect(presenceStatus(false, [true, false])).toBe('online')
  })

  it('sem conexão parada: online', () => {
    expect(presenceStatus(false, [false])).toBe('online')
    expect(presenceStatus(false, [])).toBe('online')
  })
})

describe('isActivityStatus', () => {
  it('a conexão só informa online ou ausente', () => {
    expect(isActivityStatus('online')).toBe(true)
    expect(isActivityStatus('idle')).toBe(true)
    expect(isActivityStatus('dnd')).toBe(false)
    expect(isActivityStatus(1)).toBe(false)
  })
})
