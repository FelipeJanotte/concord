// Menções na tela (B19), funções puras: dividir o texto, candidatos, "@" sendo digitado, inserir e
// converter entre "@Nome" (campo) e o token (servidor).
import { describe, expect, it } from 'vitest'
import { activeMentionQuery, candidatesFrom, filterCandidates, fromEditable, insertMention, splitMentions, toEditable } from './mentions'

const ana = '11111111-1111-1111-1111-111111111111'
const ana2 = '33333333-3333-3333-3333-333333333333'
const bia = '22222222-2222-2222-2222-222222222222'

describe('splitMentions', () => {
  it('separa texto e menções na ordem', () => {
    expect(splitMentions(`oi <@${ana}>, viu <@todos>?`)).toEqual([{ text: 'oi ' }, { mention: ana }, { text: ', viu ' }, { mention: 'todos' }, { text: '?' }])
    expect(splitMentions('sem nada')).toEqual([{ text: 'sem nada' }])
  })
})

describe('candidatos', () => {
  const people = [
    { accountId: ana, name: 'Ana', tag: 'ana1' },
    { accountId: ana2, name: 'ana', tag: 'xy' },
    { accountId: bia, name: 'Bia', tag: 'b' },
    { accountId: bia, name: 'Bia', tag: 'b' }
  ]

  it('uma por conta; nome repetido ganha o #tag; @todos primeiro quando pode', () => {
    expect(candidatesFrom(people, true).map((c) => c.label)).toEqual(['@todos', '@Ana#ana1', '@ana#xy', '@Bia'])
    expect(candidatesFrom(people, false).map((c) => c.id)).toEqual([ana, ana2, bia])
  })

  it('filtra pelo começo do nome, sem diferenciar maiúsculas', () => {
    const list = candidatesFrom(people, true)
    expect(filterCandidates(list, 'AN').map((c) => c.label)).toEqual(['@Ana#ana1', '@ana#xy'])
    expect(filterCandidates(list, 'ana#x').map((c) => c.id)).toEqual([ana2])
    expect(filterCandidates(list, '').length).toBe(4)
    expect(filterCandidates(list, 'zz')).toEqual([])
  })
})

describe('"@" sendo digitado', () => {
  it('só logo antes do cursor e no começo ou depois de espaço', () => {
    expect(activeMentionQuery('oi @an', 6)).toEqual({ start: 3, query: 'an' })
    expect(activeMentionQuery('@', 1)).toEqual({ start: 0, query: '' })
    expect(activeMentionQuery('email@x', 7)).toBeNull()
    expect(activeMentionQuery('oi @ana já', 10)).toBeNull()
    expect(activeMentionQuery('oi @ana já', 7)).toEqual({ start: 3, query: 'ana' })
  })

  it('inserir troca a consulta pelo rótulo + espaço e diz onde fica o cursor', () => {
    expect(insertMention('oi @an tudo', 3, 6, '@Ana')).toEqual({ text: 'oi @Ana  tudo', caret: 8 })
  })
})

describe('campo ⇄ servidor', () => {
  it('fromEditable troca só os rótulos escolhidos (o maior primeiro)', () => {
    const map = { '@Ana': `<@${ana}>`, '@Ana#xy': `<@${ana2}>`, '@todos': '<@todos>' }
    expect(fromEditable('@Ana#xy e @Ana, @todos, @Carla', map)).toBe(`<@${ana2}> e <@${ana}>, <@todos>, @Carla`)
  })

  it('toEditable mostra @Nome (com mapa de volta); conta sem nome fica como token; ida e volta dá o mesmo', () => {
    const content = `oi <@${ana}> <@${bia}> <@todos>`
    const { text, map } = toEditable(content, [{ accountId: ana, name: 'Ana' }])
    expect(text).toBe(`oi @Ana <@${bia}> @todos`)
    expect(fromEditable(text, map)).toBe(content)
  })

  it('dois mencionados com o mesmo nome continuam diferentes', () => {
    const content = `<@${ana}> <@${ana2}>`
    const { text, map } = toEditable(content, [
      { accountId: ana, name: 'Ana' },
      { accountId: ana2, name: 'Ana' }
    ])
    expect(text).toBe('@Ana#1111 @Ana#3333')
    expect(fromEditable(text, map)).toBe(content)
  })
})
