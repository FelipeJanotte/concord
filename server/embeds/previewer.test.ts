import { describe, expect, it } from 'vitest'
import { FetchRefused, type WebFetcher, type WebRequest } from './ports'
import { LinkPreviewer } from './previewer'

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000100000000808060000', 'hex')

type Route = { contentType: string; body: Buffer | string }

function fakeWeb(routes: Record<string, Route>): WebFetcher & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async get(url: string, request: WebRequest) {
      calls.push(url)
      const route = routes[url]
      if (!route || !request.accepts(route.contentType)) throw new FetchRefused(url)
      return { url, contentType: route.contentType, body: Buffer.from(route.body) }
    }
  }
}

const page = (head: string): Route => ({ contentType: 'text/html', body: `<html><head>${head}</head></html>` })

describe('LinkPreviewer', () => {
  it('monta a prévia com a imagem baixada e conferida pelos bytes', async () => {
    const web = fakeWeb({
      'https://a.com/': page('<meta property="og:title" content="A"><meta property="og:image" content="https://cdn.a.com/i.png">'),
      'https://cdn.a.com/i.png': { contentType: 'image/png', body: PNG }
    })
    const preview = await new LinkPreviewer(web).preview('https://a.com/')
    expect(preview).toEqual({ embed: { url: 'https://a.com/', title: 'A' }, image: { contentType: 'image/png', bytes: PNG } })
  })

  it('imagem que não é imagem de verdade: prévia sem imagem', async () => {
    const web = fakeWeb({
      'https://a.com/': page('<meta property="og:title" content="A"><meta property="og:image" content="https://a.com/x.png">'),
      'https://a.com/x.png': { contentType: 'image/png', body: '<svg onload="x">' }
    })
    expect(await new LinkPreviewer(web).preview('https://a.com/')).toEqual({ embed: { url: 'https://a.com/', title: 'A' }, image: null })
  })

  it('página que falha ou sem metadados: null', async () => {
    const web = fakeWeb({ 'https://vazia.com/': page('') })
    expect(await new LinkPreviewer(web).preview('https://vazia.com/')).toBeNull()
    expect(await new LinkPreviewer(web).preview('https://fora.com/')).toBeNull()
  })

  it('marca links de música (YouTube/Spotify)', async () => {
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    const web = fakeWeb({ [url]: page('<meta property="og:title" content="Vídeo">') })
    expect((await new LinkPreviewer(web).preview(url))?.embed).toEqual({ url, title: 'Vídeo', music: true })
  })

  it('guarda em cache por pouco tempo', async () => {
    let now = 0
    const web = fakeWeb({ 'https://a.com/': page('<title>A</title>') })
    const previewer = new LinkPreviewer(web, () => now)
    await previewer.preview('https://a.com/')
    await previewer.preview('https://a.com/')
    expect(web.calls).toEqual(['https://a.com/'])
    now += 10 * 60 * 1000
    await previewer.preview('https://a.com/')
    expect(web.calls).toHaveLength(2)
  })
})
