/**
 * Mover os times para salas de voz (v4): validação do pedido e o "quem é quem", funções puras.
 * Permissões (moderação, entrar na sala do time) e o aviso para cada conexão ficam no módulo
 * (`server/modules/tools.ts`), porque dependem do estado de acesso e das salas.
 */
import type { MoveTeamsRequest, MoveTeamsSkip, Team } from '../../src/shared/types'

/** Uma conexão que está numa sala de voz (só as salas que quem pede vê). */
export interface VoicePerson {
  socketId: string
  accountId: string
  name: string
  tag: string
  channelId: string
}

/** Quem do sorteio vai para qual sala (uma conta pode ter mais de uma conexão na voz). */
export interface PlannedMove {
  /** o nome como está no sorteio */
  name: string
  accountId: string
  channelId: string
  /** as conexões dessa conta que estão na voz */
  socketIds: string[]
}

/** Confere o formato do pedido. Devolve a entrada limpa ou a mensagem de erro (pt-BR). */
export function validateMoveRequest(raw: unknown): MoveTeamsRequest | string {
  const req = raw as Partial<MoveTeamsRequest> | null
  if (!req || typeof req !== 'object' || typeof req.messageId !== 'string' || !Array.isArray(req.channelIds)) {
    return 'Pedido inválido'
  }
  if (req.channelIds.some((id) => id !== null && (typeof id !== 'string' || !id))) return 'Pedido inválido'
  const chosen = req.channelIds.filter((id): id is string => id !== null)
  if (chosen.length === 0) return 'Escolha a sala de pelo menos um time'
  if (new Set(chosen).size !== chosen.length) return 'Escolha uma sala diferente para cada time'
  return { messageId: req.messageId, channelIds: req.channelIds as (string | null)[] }
}

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR')

/**
 * Acha cada pessoa dos times entre quem está na voz e diz para onde ela vai.
 * - Com `accountId` no resultado: pela conta (nome não importa).
 * - Sem: pelo nome ou por `nome#tag` (sem diferenciar maiúsculas). Nome que bate com duas
 *   contas diferentes é pulado (`ambiguous`): melhor não mover do que mover a pessoa errada.
 * - A mesma conta em dois lugares do sorteio: vale a primeira; a outra é pulada (`ambiguous`).
 * Times com sala `null` ficam onde estão (ninguém deles é procurado).
 */
export function planMoves(
  teams: Team[],
  channelIds: (string | null)[],
  people: VoicePerson[]
): { moves: PlannedMove[]; skipped: MoveTeamsSkip[] } {
  const moves: PlannedMove[] = []
  const skipped: MoveTeamsSkip[] = []
  const taken = new Set<string>()

  teams.forEach((team, i) => {
    const channelId = channelIds[i]
    if (!channelId) return
    for (const member of team.members) {
      let found: VoicePerson[]
      if (member.accountId) {
        found = people.filter((p) => p.accountId === member.accountId)
      } else {
        const key = normalize(member.name)
        found = people.filter((p) => normalize(p.name) === key || normalize(`${p.name}#${p.tag}`) === key)
      }
      const accounts = new Set(found.map((p) => p.accountId))
      if (accounts.size === 0) {
        skipped.push({ name: member.name, reason: 'not-in-voice' })
        continue
      }
      const [accountId] = accounts
      if (accounts.size > 1 || taken.has(accountId)) {
        skipped.push({ name: member.name, reason: 'ambiguous' })
        continue
      }
      taken.add(accountId)
      moves.push({ name: member.name, accountId, channelId, socketIds: found.map((p) => p.socketId) })
    }
  })
  return { moves, skipped }
}
