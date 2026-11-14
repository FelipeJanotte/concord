import { describe, expect, it } from 'vitest'
import { cleanFileName } from './uploads'

describe('cleanFileName', () => {
  it('decodifica o nome enviado pelo app', () => {
    expect(cleanFileName(encodeURIComponent('relatório final.pdf'))).toBe('relatório final.pdf')
  })

  it('tira pastas (Windows e Unix) e caracteres de controle', () => {
    expect(cleanFileName(encodeURIComponent('C:\\Users\\x\\foto.png'))).toBe('foto.png')
    expect(cleanFileName(encodeURIComponent('../../etc/passwd'))).toBe('passwd')
    expect(cleanFileName(encodeURIComponent('a\u0000b\nc.txt'))).toBe('abc.txt')
  })

  it('usa "arquivo" quando não sobra nome', () => {
    expect(cleanFileName(undefined)).toBe('arquivo')
    expect(cleanFileName('')).toBe('arquivo')
    expect(cleanFileName(encodeURIComponent('..'))).toBe('arquivo')
    expect(cleanFileName(encodeURIComponent('pasta/'))).toBe('arquivo')
  })

  it('aceita nome mal codificado sem quebrar', () => {
    expect(cleanFileName('100%.txt')).toBe('100%.txt')
  })

  it('corta em 200 caracteres preservando a extensão', () => {
    const name = cleanFileName(encodeURIComponent(`${'a'.repeat(300)}.jpeg`))
    expect(name).toHaveLength(200)
    expect(name.endsWith('.jpeg')).toBe(true)
  })
})
