// Endereço padrão do servidor vindo do build (VITE_DEFAULT_SERVER).
import { describe, expect, it } from 'vitest'
import { defaultServerUrl, LOCAL_SERVER } from './default-server'

describe('defaultServerUrl', () => {
  it('sem variável: o servidor local de desenvolvimento', () => {
    expect(defaultServerUrl(undefined)).toBe(LOCAL_SERVER)
    expect(defaultServerUrl('   ')).toBe('http://localhost:3001')
  })

  it('endereço http(s) vira só a origem (sem barra final nem caminho)', () => {
    expect(defaultServerUrl('https://concord.exemplo.com')).toBe('https://concord.exemplo.com')
    expect(defaultServerUrl(' https://concord.exemplo.com/ ')).toBe('https://concord.exemplo.com')
    expect(defaultServerUrl('https://concord.exemplo.com/app?x=1#y')).toBe('https://concord.exemplo.com')
    expect(defaultServerUrl('http://192.168.0.10:3001')).toBe('http://192.168.0.10:3001')
  })

  it('valor inválido ou de outro protocolo: volta ao local', () => {
    expect(defaultServerUrl('concord.exemplo.com')).toBe(LOCAL_SERVER)
    expect(defaultServerUrl('ftp://concord.exemplo.com')).toBe(LOCAL_SERVER)
    expect(defaultServerUrl('javascript:alert(1)')).toBe(LOCAL_SERVER)
  })
})
