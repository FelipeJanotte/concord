// Ferramentas do grupo (v4): pede o sorteio ao servidor. O resultado chega para todos pelo `message:new`
// (mensagem `kind: 'tool'`); a resposta daqui serve para o painel fechar ou mostrar o erro.
import type { Message, TeamPlayer } from '@shared/types'
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
