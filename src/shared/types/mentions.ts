/**
 * CONTRATO — menções @nome (v6, B19).
 *
 * No texto da mensagem, a menção é guardada pelo id da conta: `<@id-da-conta>` (o nome pode mudar, o
 * id não). `<@todos>` menciona todo mundo que vê o canal e só vale para quem tem a permissão
 * `mentionEveryone` (sem ela, o servidor troca por texto comum "@todos"). O servidor devolve em
 * `Message.mentions` o nome atual de cada conta mencionada, para a tela desenhar "@Nome".
 */

export const MENTION_EVERYONE = 'todos'
export const EVERYONE_TOKEN = `<@${MENTION_EVERYONE}>`
/** No máximo tantas contas por mensagem são resolvidas (o resto fica como texto). */
export const MENTIONS_PER_MESSAGE_MAX = 20

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
/** Uma menção no texto (grupo 1 = id da conta ou "todos"). Use sempre com `new RegExp(MENTION_SOURCE, 'gi')`. */
export const MENTION_SOURCE = `<@(${UUID}|${MENTION_EVERYONE})>`

export interface Mention {
  accountId: string
  /** nome atual da conta */
  name: string
}

/** O token de uma conta para pôr no texto. */
export const mentionToken = (accountId: string): string => `<@${accountId}>`

/** Quem o texto menciona (contas, sem repetir, até o limite) e se menciona @todos. */
export function parseMentions(content: string): { accountIds: string[]; everyone: boolean } {
  const accountIds: string[] = []
  let everyone = false
  for (const m of content.matchAll(new RegExp(MENTION_SOURCE, 'gi'))) {
    const id = m[1].toLowerCase()
    if (id === MENTION_EVERYONE) everyone = true
    else if (!accountIds.includes(id) && accountIds.length < MENTIONS_PER_MESSAGE_MAX) accountIds.push(id)
  }
  return { accountIds, everyone }
}

/** A mensagem menciona esta conta (por nome ou por @todos)? */
export function mentionsAccount(content: string, accountId: string | undefined): boolean {
  if (!accountId) return false
  const { accountIds, everyone } = parseMentions(content)
  return everyone || accountIds.includes(accountId.toLowerCase())
}

/** Texto comum, com "@Nome" no lugar dos tokens (notificações, citações). Nome desconhecido vira "@alguém". */
export function mentionsToPlain(content: string, nameOf: (accountId: string) => string | undefined): string {
  return content.replace(new RegExp(MENTION_SOURCE, 'gi'), (_t, id: string) =>
    id.toLowerCase() === MENTION_EVERYONE ? '@todos' : `@${nameOf(id.toLowerCase()) ?? 'alguém'}`
  )
}
