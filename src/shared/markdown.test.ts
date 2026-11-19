import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './markdown'

const text = (t: string) => ({ type: 'text', text: t })

describe('parseMarkdown', () => {
  it('texto sem marcação fica um nó de texto só', () => {
    expect(parseMarkdown('oi, tudo bem?')).toEqual([text('oi, tudo bem?')])
  })

  it('texto vazio não tem nós', () => {
    expect(parseMarkdown('')).toEqual([])
  })

  it('negrito, itálico, riscado e spoiler', () => {
    expect(parseMarkdown('a **b** *c* ~~d~~ ||e||')).toEqual([
      text('a '),
      { type: 'bold', children: [text('b')] },
      text(' '),
      { type: 'italic', children: [text('c')] },
      text(' '),
      { type: 'strike', children: [text('d')] },
      text(' '),
      { type: 'spoiler', children: [text('e')] }
    ])
  })

  it('código em linha guarda o texto como veio', () => {
    expect(parseMarkdown('use `**npm** <@x>` aqui')).toEqual([text('use '), { type: 'code', text: '**npm** <@x>' }, text(' aqui')])
  })

  it('aninhado: itálico dentro de negrito e código dentro de spoiler', () => {
    expect(parseMarkdown('**forte *e inclinado***')).toEqual([
      { type: 'bold', children: [text('forte '), { type: 'italic', children: [text('e inclinado')] }] }
    ])
    expect(parseMarkdown('||`segredo`||')).toEqual([{ type: 'spoiler', children: [{ type: 'code', text: 'segredo' }] }])
  })

  it('***x*** vira negrito com itálico dentro', () => {
    expect(parseMarkdown('***x***')).toEqual([{ type: 'bold', children: [{ type: 'italic', children: [text('x')] }] }])
  })

  it('itálico que contém negrito', () => {
    expect(parseMarkdown('*a **b** c*')).toEqual([
      { type: 'italic', children: [text('a '), { type: 'bold', children: [text('b')] }, text(' c')] }
    ])
  })

  it('marcação não fechada continua texto', () => {
    expect(parseMarkdown('**sem fim')).toEqual([text('**sem fim')])
    expect(parseMarkdown('~~quase')).toEqual([text('~~quase')])
    expect(parseMarkdown('||spoiler')).toEqual([text('||spoiler')])
    expect(parseMarkdown('`aberto')).toEqual([text('`aberto')])
    expect(parseMarkdown('```\nbloco aberto')).toEqual([text('```\nbloco aberto')])
  })

  it('marcação vazia continua texto', () => {
    expect(parseMarkdown('****')).toEqual([text('****')])
    expect(parseMarkdown('||||')).toEqual([text('||||')])
  })

  it('asterisco solto (conta) não vira itálico', () => {
    expect(parseMarkdown('2 * 3 * 4 = 24')).toEqual([text('2 * 3 * 4 = 24')])
    expect(parseMarkdown('nota 10*')).toEqual([text('nota 10*')])
  })

  it('HTML é texto', () => {
    expect(parseMarkdown('<b>oi</b> <script>x</script>')).toEqual([text('<b>oi</b> <script>x</script>')])
  })

  it('marcação dentro de código não vale, nem a que atravessa o código', () => {
    expect(parseMarkdown('**a `b** c`')).toEqual([text('**a '), { type: 'code', text: 'b** c' }])
  })

  it('bloco de código: some a linha da linguagem e as quebras em volta', () => {
    expect(parseMarkdown('antes\n```ts\nconst a = **1**\n```\ndepois')).toEqual([
      text('antes'),
      { type: 'codeBlock', text: 'const a = **1**' },
      text('depois')
    ])
  })

  it('bloco de código em uma linha', () => {
    expect(parseMarkdown('```npm test```')).toEqual([{ type: 'codeBlock', text: 'npm test' }])
  })

  it('citação junta as linhas seguidas com "> " e aceita marcação dentro', () => {
    expect(parseMarkdown('> primeira **forte**\n> segunda\nresposta')).toEqual([
      { type: 'quote', children: [text('primeira '), { type: 'bold', children: [text('forte')] }, text('\nsegunda')] },
      text('resposta')
    ])
  })

  it('">" sem espaço ou no meio da linha não é citação', () => {
    expect(parseMarkdown('>oi')).toEqual([text('>oi')])
    expect(parseMarkdown('a > b')).toEqual([text('a > b')])
  })

  it('marcação não atravessa a citação', () => {
    expect(parseMarkdown('> **a\nb**')).toEqual([{ type: 'quote', children: [text('**a')] }, text('b**')])
  })
})
