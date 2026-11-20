import { externalUrl } from '../../src/shared/links'

export interface PageMetadata {
  title?: string
  description?: string
  siteName?: string
  imageUrl?: string
}

export const EMBED_TITLE_MAX = 256
export const EMBED_DESCRIPTION_MAX = 500
export const EMBED_SITE_NAME_MAX = 100

const META_TAG = /<meta\b[^>]*>/gi
const ATTRIBUTE = /([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
const TITLE_TAG = /<title\b[^>]*>([^<]*)<\/title>/i
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntity(match: string, name: string): string {
  if (name[0] !== '#') return NAMED_ENTITIES[name.toLowerCase()] ?? match
  const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
}

function cleanText(raw: string | undefined, max: number): string | undefined {
  if (!raw) return undefined
  const text = raw.replace(ENTITY, decodeEntity).replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text
}

function metaValues(html: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const [tag] of html.matchAll(META_TAG)) {
    const attributes = new Map<string, string>()
    for (const m of tag.matchAll(ATTRIBUTE)) attributes.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '')
    const key = (attributes.get('property') ?? attributes.get('name'))?.toLowerCase()
    const content = attributes.get('content')
    if (key && content !== undefined && !values.has(key)) values.set(key, content)
  }
  return values
}

function absoluteImage(raw: string | undefined, pageUrl: string): string | undefined {
  const text = cleanText(raw, 2048)
  if (!text) return undefined
  try {
    return externalUrl(new URL(text, pageUrl).href) ?? undefined
  } catch {
    return undefined
  }
}

export function parseOpenGraph(html: string, pageUrl: string): PageMetadata | null {
  const meta = metaValues(html)
  const title = cleanText(meta.get('og:title') ?? TITLE_TAG.exec(html)?.[1], EMBED_TITLE_MAX)
  const description = cleanText(meta.get('og:description') ?? meta.get('description'), EMBED_DESCRIPTION_MAX)
  if (!title && !description) return null
  const siteName = cleanText(meta.get('og:site_name'), EMBED_SITE_NAME_MAX)
  const imageUrl = absoluteImage(meta.get('og:image'), pageUrl)
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(siteName ? { siteName } : {})
  }
}
