/**
 * Menções na tela (B19), funções puras. No servidor e no banco a menção é `<@id-da-conta>`; na
 * tela e nos campos de texto a pessoa vê e digita "@Nome". Aqui ficam as conversões e o
 * autocompletar. Contrato em `@shared/types` (`mentions.ts`).
 */
import { EVERYONE_TOKEN, MENTION_EVERYONE, MENTION_SOURCE, mentionToken, type Mention } from '@shared/types'

export type TextPart = { text: string } | { mention: string }

/** Divide o texto em pedaços comuns e menções (`mention` = id da conta ou "todos"). */
export function splitMentions(content: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const m of content.matchAll(new RegExp(MENTION_SOURCE, 'gi'))) {
    if (m.index > last) parts.push({ text: content.slice(last, m.index) })
    parts.push({ mention: m[1].toLowerCase() })
    last = m.index + m[0].length
  }
  if (last < content.length) parts.push({ text: content.slice(last) })
  return parts
}

/** Uma pessoa que pode ser mencionada no campo. */
export interface MentionCandidate {
  /** id da conta, ou "todos" */
  id: string
  name: string
  /** o que entra no campo, ex.: "@Ana" (ou "@Ana#ana1" quando há dois com o mesmo nome) */
  label: string
}

/** Candidatos com rótulos únicos: nome repetido ganha o `#tag`. */
export function candidatesFrom(people: Array<{ accountId: string; name: string; tag: string }>, allowEveryone: boolean): MentionCandidate[] {
  const seen = new Set<string>()
  const unique = people.filter((p) => !seen.has(p.accountId) && seen.add(p.accountId))
  const count = new Map<string, number>()
  for (const p of unique) count.set(p.name.toLowerCase(), (count.get(p.name.toLowerCase()) ?? 0) + 1)
  const list: MentionCandidate[] = unique.map((p) => ({
    id: p.accountId,
    name: p.name,
    label: count.get(p.name.toLowerCase())! > 1 ? `@${p.name}#${p.tag}` : `@${p.name}`
  }))
  if (allowEveryone) list.unshift({ id: MENTION_EVERYONE, name: 'todos', label: '@todos' })
  return list
}

/** O "@algo" que está sendo digitado logo antes do cursor (início e o texto depois do @), ou null. */
export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const m = /(^|\s)@([^\s@]{0,32})$/.exec(before)
  if (!m) return null
  return { start: before.length - m[2].length - 1, query: m[2] }
}

/** Filtra os candidatos pelo começo do nome (sem diferenciar maiúsculas), no máximo `limit`. */
export function filterCandidates(candidates: MentionCandidate[], query: string, limit = 8): MentionCandidate[] {
  const q = query.toLocaleLowerCase('pt-BR')
  return candidates.filter((c) => c.name.toLocaleLowerCase('pt-BR').startsWith(q) || c.label.slice(1).toLocaleLowerCase('pt-BR').startsWith(q)).slice(0, limit)
}

/** Troca o "@consulta" pelo rótulo escolhido + espaço. Devolve o texto novo e onde fica o cursor. */
export function insertMention(text: string, start: number, caret: number, label: string): { text: string; caret: number } {
  const next = `${text.slice(0, start)}${label} ${text.slice(caret)}`
  return { text: next, caret: start + label.length + 1 }
}

/** Rótulo visível → token, das menções escolhidas no campo. */
export type MentionMap = Record<string, string>

/** Antes de enviar: cada rótulo escolhido que ainda está no texto vira token. */
export function fromEditable(text: string, map: MentionMap): string {
  let out = text
  // rótulos maiores primeiro, para "@Ana#ana1" não ser trocado como "@Ana"
  for (const label of Object.keys(map).sort((a, b) => b.length - a.length)) out = out.split(label).join(map[label])
  return out
}

/** Para editar: tokens viram "@Nome" (com o mapa de volta). Conta sem nome conhecido continua como token. */
export function toEditable(content: string, mentions: Mention[] = []): { text: string; map: MentionMap } {
  const map: MentionMap = {}
  const text = content.replace(new RegExp(MENTION_SOURCE, 'gi'), (token, id: string) => {
    const lower = id.toLowerCase()
    if (lower === MENTION_EVERYONE) {
      map['@todos'] = EVERYONE_TOKEN
      return '@todos'
    }
    const name = mentions.find((m) => m.accountId === lower)?.name
    if (!name) return token
    const sameName = mentions.filter((m) => m.name.toLowerCase() === name.toLowerCase()).length > 1
    const label = sameName ? `@${name}#${lower.slice(0, 4)}` : `@${name}`
    map[label] = mentionToken(lower)
    return label
  })
  return { text, map }
}
