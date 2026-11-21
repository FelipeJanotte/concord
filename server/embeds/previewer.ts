import type { LinkEmbed } from '../../src/shared/types'
import { parseMusicQuery } from '../music/query'
import { sniffImage, type ImageInfo } from '../storage/sniff'
import { parseOpenGraph } from './open-graph'
import { FetchRefused, type WebFetcher, type WebRequest } from './ports'

export const HTML_MAX_BYTES = 512 * 1024
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024
export const PREVIEW_CACHE_TTL_MS = 5 * 60 * 1000
const PREVIEW_CACHE_MAX = 50

export interface EmbedImage {
  contentType: ImageInfo['contentType']
  bytes: Buffer
}

export interface LinkPreview {
  embed: Omit<LinkEmbed, 'imageUrl'>
  image: EmbedImage | null
}

const PAGE_REQUEST: WebRequest = { maxBytes: HTML_MAX_BYTES, accepts: (type) => type === 'text/html', oversize: 'truncate' }
const IMAGE_REQUEST: WebRequest = { maxBytes: IMAGE_MAX_BYTES, accepts: (type) => type.startsWith('image/'), oversize: 'reject' }

async function refusedAsNull<T>(work: Promise<T>): Promise<T | null> {
  try {
    return await work
  } catch (err) {
    if (err instanceof FetchRefused) return null
    throw err
  }
}

export class LinkPreviewer {
  private cache = new Map<string, { expiresAt: number; preview: Promise<LinkPreview | null> }>()

  constructor(
    private readonly web: WebFetcher,
    private readonly now: () => number = Date.now
  ) {}

  preview(url: string): Promise<LinkPreview | null> {
    const now = this.now()
    const cached = this.cache.get(url)
    if (cached && cached.expiresAt > now) return cached.preview
    const preview = this.build(url)
    this.cache.delete(url)
    this.cache.set(url, { expiresAt: now + PREVIEW_CACHE_TTL_MS, preview })
    preview.catch(() => this.cache.delete(url))
    this.evict(now)
    return preview
  }

  private evict(now: number): void {
    for (const [url, entry] of this.cache) {
      if (entry.expiresAt <= now || this.cache.size > PREVIEW_CACHE_MAX) this.cache.delete(url)
    }
  }

  private async build(url: string): Promise<LinkPreview | null> {
    const page = await refusedAsNull(this.web.get(url, PAGE_REQUEST))
    const meta = page && parseOpenGraph(page.body.toString('utf8'), page.url)
    if (!meta) return null
    const { imageUrl, ...text } = meta
    return {
      embed: { url, ...text, ...(parseMusicQuery(url) ? { music: true } : {}) },
      image: imageUrl ? await this.image(imageUrl) : null
    }
  }

  private async image(url: string): Promise<EmbedImage | null> {
    const res = await refusedAsNull(this.web.get(url, IMAGE_REQUEST))
    const info = res && sniffImage(res.body)
    return info ? { contentType: info.contentType, bytes: res.body } : null
  }
}
