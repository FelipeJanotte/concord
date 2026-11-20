import { describe, expect, it } from 'vitest'
import { parseOpenGraph } from './open-graph'

const PAGE = 'https://www.exemplo.com.br/noticias/1'

describe('parseOpenGraph', () => {
  it('lê og:title, og:description, og:image e og:site_name com acentos e entidades', () => {
    const html = `<!doctype html><html><head>
      <meta charset="utf-8">
      <title>Título da aba</title>
      <meta property="og:title" content="Ação &amp; reação: o &quot;básico&quot; &#8212; parte&nbsp;1">
      <meta content='Descrição com &lt;tags&gt; e &#x1F600; emoji' property='og:description' />
      <meta property="og:image" content="/img/capa.png">
      <meta property="og:site_name" content="Exemplo Notícias">
      </head><body></body></html>`
    expect(parseOpenGraph(html, PAGE)).toEqual({
      title: 'Ação & reação: o "básico" — parte 1',
      description: 'Descrição com <tags> e 😀 emoji',
      imageUrl: 'https://www.exemplo.com.br/img/capa.png',
      siteName: 'Exemplo Notícias'
    })
  })

  it('sem Open Graph: usa <title> e meta description', () => {
    const html = '<html><head><TITLE>\n  Página   simples \n</TITLE><meta name="Description" content="Resumo da página"></head></html>'
    expect(parseOpenGraph(html, PAGE)).toEqual({ title: 'Página simples', description: 'Resumo da página' })
  })

  it('sem nenhuma tag útil: null', () => {
    expect(parseOpenGraph('só um texto sem tags', PAGE)).toBeNull()
    expect(parseOpenGraph('<html><head><meta property="og:image" content="/a.png"></head></html>', PAGE)).toBeNull()
  })

  it('ignora imagem que não é http(s)', () => {
    const html = '<meta property="og:title" content="X"><meta property="og:image" content="javascript:alert(1)">'
    expect(parseOpenGraph(html, PAGE)).toEqual({ title: 'X' })
  })

  it('corta textos longos', () => {
    const html = `<meta property="og:title" content="${'a'.repeat(1000)}"><meta property="og:description" content="${'b'.repeat(5000)}">`
    const preview = parseOpenGraph(html, PAGE)!
    expect(preview.title!.length).toBeLessThanOrEqual(256)
    expect(preview.description!.length).toBeLessThanOrEqual(500)
    expect(preview.title!.endsWith('…')).toBe(true)
  })

  it('HTML gigante e malformado termina rápido', () => {
    const html = '<meta ' + 'a="b" '.repeat(50_000) + '<title>Ok</title>' + '<div>'.repeat(100_000)
    const started = Date.now()
    expect(parseOpenGraph(html, PAGE)).toEqual({ title: 'Ok' })
    expect(Date.now() - started).toBeLessThan(1000)
  })
})
