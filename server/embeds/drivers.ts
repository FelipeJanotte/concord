import { isPublicAddress } from './address'
import type { WebFetcher } from './ports'
import { createSafeFetcher } from './safe-fetch'

let override: WebFetcher | null = null

export function overrideWebFetcher(next: WebFetcher): void {
  override = next
}

export function webFetcher(): WebFetcher {
  return override ?? createSafeFetcher({ allowAddress: isPublicAddress })
}
