// Ferramentas do grupo (v4): pede o sorteio ao servidor. O resultado chega para todos pelo `message:new`
// (mensagem `kind: 'tool'`); a resposta daqui serve para o painel fechar ou mostrar o erro.
import type { Message, TeamPlayer, ToolResult } from '@shared/types'
import { requireSocket } from '../core'

export interface DrawTeamsOptions {
  channelId: string
  /** nomes digitados ou importados (sala de voz, online); vazios e espaços extras são limpos aqui */
  players: TeamPlayer[]
  teamCount: number
  lanes?: boolean
}

/** Sorteia no servidor e posta no canal. Lança `Error` com a mensagem do servidor. */
export async function drawTeams({ channelId, players, teamCount, lanes = false }: DrawTeamsOptions): Promise<Message> {
  const clean = players
    .map((p) => ({ ...p, name: p.name.replace(/\s+/g, ' ').trim() }))
    .filter((p) => p.name)
    .map((p) => (lanes && p.lanes?.length ? { name: p.name, lanes: p.lanes } : { name: p.name }))
  const res = await requireSocket().emitWithAck('tools:teams', { channelId, players: clean, teamCount, lanes })
  if (!res.ok) throw new Error(res.error)
  return res.message
}

function unwrap(res: ToolResult): Message {
  if (!res.ok) throw new Error(res.error)
  return res.message
}

/** Rola `count` dados de `sides` lados (ex.: 1 d20, 2 d6) e posta no canal. */
export async function rollDice(channelId: string, sides: number, count = 1): Promise<Message> {
  return unwrap(await requireSocket().emitWithAck('tools:dice', { channelId, sides, count }))
}

/** Joga `count` moedas e posta no canal. */
export async function flipCoin(channelId: string, count = 1): Promise<Message> {
  return unwrap(await requireSocket().emitWithAck('tools:coin', { channelId, count }))
}

/**
 * Sorteia 1 entre as opções e posta no canal. Aceita a lista pronta ou o texto do campo
 * (uma opção por linha); linhas vazias são ignoradas pelo servidor.
 */
export async function pickOne(channelId: string, options: string[] | string): Promise<Message> {
  const list = typeof options === 'string' ? options.split(/\r?\n/) : options
  return unwrap(await requireSocket().emitWithAck('tools:pick', { channelId, options: list }))
}
