import { overrideWebFetcher } from '../embeds/drivers'
import { createSafeFetcher } from '../embeds/safe-fetch'

overrideWebFetcher(createSafeFetcher({ allowAddress: () => true }))
