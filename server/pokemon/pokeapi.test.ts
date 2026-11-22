import { describe, expect, it } from 'vitest'
import { fetchEvolution, fetchHuntInfo, fetchRegionDex, fetchSpecies, POKEAPI_URL } from './pokeapi'

const levelUp = (name: string, level: number) => ({
  move: { name, url: `${POKEAPI_URL}/move/${name}/` },
  version_group_details: [{ level_learned_at: level, move_learn_method: { name: 'level-up' } }]
})
const tm = (name: string) => ({
  move: { name, url: `${POKEAPI_URL}/move/${name}/` },
  version_group_details: [{ level_learned_at: 0, move_learn_method: { name: 'machine' } }]
})

const responses: Record<string, unknown> = {
  [`${POKEAPI_URL}/pokemon/4`]: {
    id: 4,
    name: 'charmander',
    species: { url: `${POKEAPI_URL}/pokemon-species/4/` },
    types: [{ type: { name: 'fire' } }],
    sprites: { front_default: 'front.png', back_default: 'back.png' },
    stats: [
      { base_stat: 39, stat: { name: 'hp' } },
      { base_stat: 52, stat: { name: 'attack' } },
      { base_stat: 43, stat: { name: 'defense' } },
      { base_stat: 60, stat: { name: 'special-attack' } },
      { base_stat: 50, stat: { name: 'special-defense' } },
      { base_stat: 65, stat: { name: 'speed' } }
    ],
    moves: [levelUp('scratch', 1), levelUp('growl', 1), levelUp('ember', 4), levelUp('flamethrower', 30), tm('fire-blast')]
  },
  [`${POKEAPI_URL}/pokemon-species/4`]: { evolution_chain: { url: `${POKEAPI_URL}/evolution-chain/2/` } },
  [`${POKEAPI_URL}/pokemon-species/5`]: { evolution_chain: { url: `${POKEAPI_URL}/evolution-chain/2/` } },
  [`${POKEAPI_URL}/pokemon-species/6`]: { evolution_chain: { url: `${POKEAPI_URL}/evolution-chain/2/` } },
  [`${POKEAPI_URL}/pokemon-species/133`]: { evolution_chain: { url: `${POKEAPI_URL}/evolution-chain/67/` } },
  [`${POKEAPI_URL}/evolution-chain/2/`]: {
    chain: {
      species: { url: `${POKEAPI_URL}/pokemon-species/4/` },
      evolution_details: [],
      evolves_to: [
        {
          species: { name: 'charmeleon', url: `${POKEAPI_URL}/pokemon-species/5/` },
          evolution_details: [{ min_level: 16 }],
          evolves_to: [{ species: { name: 'charizard', url: `${POKEAPI_URL}/pokemon-species/6/` }, evolution_details: [{ min_level: 36 }], evolves_to: [] }]
        }
      ]
    }
  },
  [`${POKEAPI_URL}/evolution-chain/67/`]: {
    chain: {
      species: { url: `${POKEAPI_URL}/pokemon-species/133/` },
      evolution_details: [],
      evolves_to: [{ species: { name: 'vaporeon', url: `${POKEAPI_URL}/pokemon-species/134/` }, evolution_details: [{ min_level: null }], evolves_to: [] }]
    }
  },
  [`${POKEAPI_URL}/move/scratch/`]: { name: 'scratch', power: 40, type: { name: 'normal' }, damage_class: { name: 'physical' } },
  [`${POKEAPI_URL}/move/growl/`]: { name: 'growl', power: null, type: { name: 'normal' } },
  [`${POKEAPI_URL}/move/ember/`]: { name: 'ember', power: 40, type: { name: 'fire' }, damage_class: { name: 'special' } },
  [`${POKEAPI_URL}/move/flamethrower/`]: { name: 'flamethrower', power: 90, type: { name: 'fire' }, damage_class: { name: 'special' } }
}

const fakeJson = async (url: string) => {
  if (!(url in responses)) throw new Error(`sem resposta para ${url}`)
  return responses[url]
}

describe('PokeAPI', () => {
  it('evolução: próxima espécie da cadeia, 1ª no nível 100 e 2ª no 200; última forma não evolui', async () => {
    expect(await fetchEvolution(133, fakeJson)).toEqual({ id: 134, level: 100, name: 'vaporeon' })
    expect(await fetchEvolution(5, fakeJson)).toEqual({ id: 6, level: 200, name: 'charizard' })
    expect(await fetchEvolution(6, fakeJson)).toBeNull()
  })

  it('lê espécie, tipos, sprites, atributos e todos os golpes de dano por nível, com o nível', async () => {
    expect(await fetchSpecies(4, fakeJson)).toEqual({
      id: 4,
      name: 'charmander',
      types: ['fire'],
      sprite: 'front.png',
      backSprite: 'back.png',
      stats: { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 },
      moves: [
        { name: 'scratch', power: 40, type: 'normal', level: 1, category: 'physical' },
        { name: 'ember', power: 40, type: 'fire', level: 4, category: 'special' },
        { name: 'flamethrower', power: 90, type: 'fire', level: 30, category: 'special' }
      ],
      evolution: { id: 5, level: 100, name: 'charmeleon' }
    })
  })

  it('sem nenhum golpe de dano usa Investida no nível 1', async () => {
    const species = await fetchSpecies(4, async (url) => (url.includes('/move/') ? { name: 'x', power: null, type: { name: 'normal' } } : fakeJson(url)))
    expect(species.moves).toEqual([{ name: 'tackle', power: 40, type: 'normal', level: 1, category: 'physical' }])
  })
})

describe('lista da região', () => {
  it('lista só a primeira forma de cada pokémon da região, sem lendários e míticos; bebê de geração depois não conta', async () => {
    const species: Record<string, unknown> = {
      [`${POKEAPI_URL}/pokemon-species?offset=151&limit=100`]: {
        results: [152, 153, 169, 175, 249, 251].map((id) => ({ name: `mon-${id}`, url: `${POKEAPI_URL}/pokemon-species/${id}/` }))
      },
      [`${POKEAPI_URL}/pokemon-species/152`]: { evolves_from_species: null, is_legendary: false, is_mythical: false },
      [`${POKEAPI_URL}/pokemon-species/153`]: { evolves_from_species: { name: 'chikorita', url: `${POKEAPI_URL}/pokemon-species/152/` }, is_legendary: false, is_mythical: false },
      [`${POKEAPI_URL}/pokemon-species/169`]: { evolves_from_species: { name: 'golbat', url: `${POKEAPI_URL}/pokemon-species/42/` }, is_legendary: false, is_mythical: false },
      [`${POKEAPI_URL}/pokemon-species/25`]: { evolves_from_species: { name: 'pichu', url: `${POKEAPI_URL}/pokemon-species/172/` }, is_legendary: false, is_mythical: false },
      [`${POKEAPI_URL}/pokemon-species/175`]: { evolves_from_species: null, is_legendary: false, is_mythical: false },
      [`${POKEAPI_URL}/pokemon-species/249`]: { evolves_from_species: null, is_legendary: true, is_mythical: false },
      [`${POKEAPI_URL}/pokemon-species/251`]: { evolves_from_species: null, is_legendary: false, is_mythical: true },
      [`${POKEAPI_URL}/pokemon/152`]: { types: [{ type: { name: 'grass' } }] },
      [`${POKEAPI_URL}/pokemon/175`]: { types: [{ type: { name: 'fairy' } }, { type: { name: 'flying' } }] }
    }
    const fetchJson = async (url: string) => species[url]
    expect(await fetchRegionDex('johto', fetchJson)).toEqual([
      { id: 152, name: 'mon-152', types: ['grass'] },
      { id: 175, name: 'mon-175', types: ['fairy', 'flying'] }
    ])
    expect(await fetchHuntInfo(153, fetchJson)).toEqual({ base: false, legendary: false })
    expect(await fetchHuntInfo(25, fetchJson)).toEqual({ base: true, legendary: false })
    expect(await fetchHuntInfo(251, fetchJson)).toEqual({ base: true, legendary: true })
  })
})
