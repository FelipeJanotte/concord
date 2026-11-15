// A CSP do app (src/renderer/index.html) precisa deixar tocar o áudio que vem do servidor do Concord: os efeitos
// sonoros (B17) são <audio> com src http(s)://<servidor>/sounds/... Sem `http:`/`https:` em media-src o navegador
// bloqueia e ninguém ouve (o erro só aparece no console).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8')
const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? ''
const directive = (name: string): string[] =>
  csp
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .find(([n]) => n === name)
    ?.slice(1) ?? []

describe('CSP do app', () => {
  it('media-src aceita áudio do servidor (http e https) além de blob/mediastream', () => {
    expect(csp).not.toBe('')
    expect(directive('media-src')).toEqual(expect.arrayContaining(["'self'", 'blob:', 'mediastream:', 'http:', 'https:']))
  })

  it('connect-src continua liberando o servidor (HTTP e WebSocket)', () => {
    expect(directive('connect-src')).toEqual(expect.arrayContaining(['ws:', 'wss:', 'http:', 'https:']))
  })
})
