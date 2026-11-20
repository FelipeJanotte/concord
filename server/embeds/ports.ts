export interface WebRequest {
  maxBytes: number
  accepts: (contentType: string) => boolean
  oversize: 'truncate' | 'reject'
}

export interface WebResponse {
  url: string
  contentType: string
  body: Buffer
}

export interface WebFetcher {
  get(url: string, request: WebRequest): Promise<WebResponse>
}

export class FetchRefused extends Error {}
