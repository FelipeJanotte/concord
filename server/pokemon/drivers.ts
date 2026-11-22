import { getJson, type FetchJson } from './pokeapi'

let override: FetchJson | null = null

export function overridePokeApi(next: FetchJson): void {
  override = next
}

export function pokeApiJson(): FetchJson {
  return override ?? getJson
}
