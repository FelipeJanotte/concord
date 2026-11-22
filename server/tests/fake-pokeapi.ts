import { overridePokeApi } from '../pokemon/drivers'
import { POKEAPI_URL } from '../pokemon/pokeapi'

const idOf = (url: string) => Number(url.split('/').filter(Boolean).pop())
const chainStart = (id: number) => id - ((id - 1) % 3)

overridePokeApi(async (url) => {
  const list = url.match(/pokemon-species\?offset=(\d+)&limit=(\d+)/)
  if (list) return { results: Array.from({ length: Number(list[2]) }, (_, k) => ({ name: `mon-${Number(list[1]) + k + 1}`, url: `${POKEAPI_URL}/pokemon-species/${Number(list[1]) + k + 1}/` })) }
  const id = idOf(url)
  if (url.startsWith(`${POKEAPI_URL}/pokemon/`)) {
    return {
      id,
      name: `mon-${id}`,
      species: { url: `${POKEAPI_URL}/pokemon-species/${id}/` },
      types: [{ type: { name: 'normal' } }],
      sprites: { front_default: `${id}.png`, back_default: `${id}-back.png` },
      stats: ['hp', 'attack', 'defense', 'speed'].map((stat) => ({ base_stat: 50, stat: { name: stat } })),
      moves: []
    }
  }
  if (url.startsWith(`${POKEAPI_URL}/pokemon-species/`))
    return { evolution_chain: { url: `${POKEAPI_URL}/evolution-chain/${chainStart(id)}/` }, evolves_from_species: chainStart(id) === id ? null : { name: `mon-${id - 1}`, url: `${POKEAPI_URL}/pokemon-species/${id - 1}/` }, is_legendary: false, is_mythical: false }
  const link = (n: number, rest: unknown[]) => ({ species: { url: `${POKEAPI_URL}/pokemon-species/${n}/` }, evolves_to: rest })
  return { chain: link(id, [link(id + 1, [link(id + 2, [])])]) }
})
