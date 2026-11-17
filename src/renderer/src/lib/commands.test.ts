import { describe, expect, it } from 'vitest'
import { CHAT_COMMANDS, commandBlock, commandDraft, commandSuggestions, parseCommand } from './commands'

const names = (text: string): string[] => commandSuggestions(text).map((c) => c.name)

describe('registro de comandos', () => {
  it('os comandos do bot de música, cada um com descrição curta', () => {
    expect(CHAT_COMMANDS.map((c) => c.name)).toEqual(['play', 'skip', 'stop', 'queue'])
    expect(CHAT_COMMANDS.find((c) => c.name === 'play')?.arg?.name).toBe('query')
    for (const command of CHAT_COMMANDS) expect(command.description.length).toBeGreaterThan(0)
  })
})

describe('commandSuggestions', () => {
  it.each([
    ['/', ['play', 'skip', 'stop', 'queue']],
    ['/pl', ['play']],
    ['/S', ['skip', 'stop']],
    ['/sk', ['skip']],
    ['/play', ['play']]
  ])('%j', (text, expected) => {
    expect(names(text)).toEqual(expected)
  })

  it.each([[''], ['oi /play'], [' /play'], ['/play '], ['/play lofi'], ['/x'], ['//'], ['/\n']])('nada: %j', (text) => {
    expect(names(text)).toEqual([])
  })
})

describe('parseCommand', () => {
  it.each([
    ['/play lofi', { name: 'play', arg: 'lofi' }],
    ['  /PLAY   lofi  ', { name: 'play', arg: 'lofi' }],
    ['/play', { name: 'play', arg: '' }],
    ['/skip', { name: 'skip', arg: '' }],
    ['/Queue', { name: 'queue', arg: '' }]
  ])('%j', (text, expected) => {
    expect(parseCommand(text)).toEqual(expected)
  })

  it.each([['oi /play x'], ['/playx'], ['/tocar x'], ['/skipped'], ['play x'], ['']])('não é comando: %j', (text) => {
    expect(parseCommand(text)).toBeNull()
  })
})

describe('commandDraft', () => {
  const play = CHAT_COMMANDS[0]
  it.each([
    ['/play', { command: '/play', rest: '', arg: play.arg }],
    ['/play ', { command: '/play', rest: ' ', arg: play.arg }],
    ['/PLAY lofi', { command: '/PLAY', rest: ' lofi', arg: play.arg }],
    ['/play\nlinha', { command: '/play', rest: '\nlinha', arg: play.arg }],
    ['/skip', { command: '/skip', rest: '', arg: undefined }],
    ['/Queue ', { command: '/Queue', rest: ' ', arg: undefined }]
  ])('%j', (text, expected) => {
    expect(commandDraft(text)).toEqual(expected)
  })

  it.each([[''], ['/pla'], ['/playx'], [' /play'], ['oi /play'], ['/pular'], ['/queues']])('não é comando: %j', (text) => {
    expect(commandDraft(text)).toBeNull()
  })
})

describe('commandBlock', () => {
  const play = CHAT_COMMANDS[0]
  it.each([
    ['/play ', { command: '/play', arg: play.arg, rest: '' }],
    ['/PLAY lofi', { command: '/PLAY', arg: play.arg, rest: 'lofi' }],
    ['/play  dois espaços', { command: '/play', arg: play.arg, rest: ' dois espaços' }],
    ['/play a\nb', { command: '/play', arg: play.arg, rest: 'a\nb' }]
  ])('%j', (text, expected) => {
    expect(commandBlock(text)).toEqual(expected)
  })

  it.each([[''], ['/play'], ['/play\nx'], ['/skip '], ['/queue x'], [' /play x'], ['/playx y']])('sem bloco: %j', (text) => {
    expect(commandBlock(text)).toBeNull()
  })
})
