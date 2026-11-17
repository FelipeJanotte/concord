export interface ChatCommandArg {
  name: string
  hint: string
}

export interface ChatCommand {
  name: string
  arg?: ChatCommandArg
  description: string
}

export const CHAT_COMMANDS: readonly ChatCommand[] = [
  {
    name: 'play',
    arg: { name: 'query', hint: 'link do Spotify/YouTube ou nome da música' },
    description: 'Toca uma música ou playlist do Spotify/YouTube, ou busca pelo nome'
  },
  { name: 'skip', description: 'Pula a música atual' },
  { name: 'stop', description: 'Para a música e limpa a fila' },
  { name: 'queue', description: 'Mostra a fila de músicas' }
]

const findCommand = (typed: string): ChatCommand | undefined => CHAT_COMMANDS.find((c) => c.name === typed.toLowerCase())

export function commandSuggestions(text: string): ChatCommand[] {
  const match = /^\/(\w*)$/.exec(text)
  if (!match) return []
  const prefix = match[1].toLowerCase()
  return CHAT_COMMANDS.filter((c) => c.name.startsWith(prefix))
}

export function parseCommand(text: string): { name: string; arg: string } | null {
  const match = /^\/(\S+)(?:\s+(.*))?$/s.exec(text.trim())
  const command = match && findCommand(match[1])
  return command ? { name: command.name, arg: match[2]?.trim() ?? '' } : null
}

export function commandDraft(text: string): { command: string; rest: string; arg?: ChatCommandArg } | null {
  const match = /^\/(\w+)(\s[\s\S]*)?$/.exec(text)
  const command = match && findCommand(match[1])
  return command ? { command: `/${match[1]}`, rest: match[2] ?? '', arg: command.arg } : null
}
