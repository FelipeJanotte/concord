/**
 * Links nas mensagens, funções puras usadas pelo app (achar e desenhar o link) e pelo processo
 * principal (só abrir no navegador o que for http/https). Reconhece `http://`, `https://` e
 * endereços que começam com `www.` (abertos como https).
 */

export type LinkPart = { text: string } | { url: string; href: string }

// para no espaço e nos caracteres que não aparecem em URL de texto corrido; o fim é aparado depois
const LINK_SOURCE = String.raw`\b(?:https?:\/\/|www\.)[^\s<>"\x60]+`
/** pontuação que costuma fechar a frase, não o link */
const TRAILING = /[.,;:!?'*_~]+$/

/** Tira do fim a pontuação da frase e o ")" sem "(" correspondente dentro do link. */
function trimEnd(raw: string): string {
  let url = raw
  for (;;) {
    const before = url
    url = url.replace(TRAILING, '')
    if (url.endsWith(')')) {
      const open = url.split('(').length - 1
      const close = url.split(')').length - 1
      if (close > open) url = url.slice(0, -1)
    }
    if (url === before) return url
  }
}

/** Endereço que pode ser aberto fora do app (só http e https), ou null. */
export function externalUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** Divide o texto em pedaços comuns e links. `url` é o que aparece; `href` é o que abre. */
export function splitLinks(content: string): LinkPart[] {
  const parts: LinkPart[] = []
  let last = 0
  for (const m of content.matchAll(new RegExp(LINK_SOURCE, 'gi'))) {
    const url = trimEnd(m[0])
    const href = externalUrl(/^www\./i.test(url) ? `https://${url}` : url)
    // "www." sozinho ou "https://" sem host não é link
    if (!href || /^(?:https?:\/\/|www\.)$/i.test(url)) continue
    if (m.index > last) parts.push({ text: content.slice(last, m.index) })
    parts.push({ url, href })
    last = m.index + url.length
  }
  if (last < content.length) parts.push({ text: content.slice(last) })
  return parts
}
