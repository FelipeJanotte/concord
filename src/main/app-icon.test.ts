import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { windowIconOptions } from './app-icon'

const projectRoot = join(__dirname, '../..')

describe('windowIconOptions', () => {
  it('em desenvolvimento a janela usa o ícone do Concord, não o do electron.exe', () => {
    const { icon } = windowIconOptions(false, projectRoot)
    expect(typeof icon).toBe('string')
    expect(existsSync(icon as string)).toBe(true)
    expect(icon).toBe(join(projectRoot, 'build', 'icon.ico'))
  })

  it('no app empacotado não passa ícone: o Windows usa o do concord.exe', () => {
    expect(windowIconOptions(true, projectRoot)).toEqual({})
  })
})
