import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { electronAppGuid, uuidV5 } from './electron-guid.mjs'

const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const ELECTRON_BUILDER_NAMESPACE = '50e065bc-3134-11e6-9bab-38c9862bdaf3'

describe('uuidV5', () => {
  it('matches the RFC 4122 reference value', () => {
    expect(uuidV5('python.org', DNS_NAMESPACE)).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d')
  })
})

describe('electronAppGuid', () => {
  it('is the key the old Electron install of Concord used', () => {
    expect(electronAppGuid('com.concord.app')).toBe('5913399b-029d-504c-af52-ca654e517444')
  })

  it('is the version 5 UUID of the app id in the electron-builder namespace', () => {
    expect(electronAppGuid('com.concord.app')).toBe(uuidV5('com.concord.app', ELECTRON_BUILDER_NAMESPACE))
  })

  it('is the key the NSIS hook looks for', () => {
    const hooks = readFileSync(new URL('../../src-tauri/windows/hooks.nsh', import.meta.url), 'utf8')
    expect(hooks).toContain(`!define ELECTRON_APP_GUID "${electronAppGuid('com.concord.app')}"`)
  })
})
