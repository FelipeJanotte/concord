import { mentionsToPlain, type Message } from '@shared/types'

export interface ParsedSearch {
  query: string
  authorName?: string
}

export interface Person {
  accountId: string
  name: string
  tag: string
}

export interface HighlightPart {
  text: string
  match: boolean
}

const AUTHOR_FILTER = /(?:^|\s)de:(?:"([^"]+)"|(\S+))/i
const SNIPPET_BEFORE = 40
const SNIPPET_MAX = 160

export function parseSearchInput(text: string): ParsedSearch {
  const found = AUTHOR_FILTER.exec(text)
  if (!found) return { query: text.trim().replace(/\s+/g, ' ') }
  const query = (text.slice(0, found.index) + ' ' + text.slice(found.index + found[0].length)).trim().replace(/\s+/g, ' ')
  return { query, authorName: (found[1] ?? found[2]).replace(/^@/, '') }
}

export function findAuthor(name: string, people: Person[]): string | undefined {
  const wanted = name.toLowerCase()
  const exact = people.find((p) => `${p.name}#${p.tag}`.toLowerCase() === wanted)
  return (exact ?? people.find((p) => p.name.toLowerCase() === wanted))?.accountId
}

function snippet(text: string, query: string): string {
  if (text.length <= SNIPPET_MAX) return text
  const at = query ? Math.max(0, text.toLowerCase().indexOf(query.toLowerCase())) : 0
  const start = Math.max(0, at - SNIPPET_BEFORE)
  const end = Math.min(text.length, start + SNIPPET_MAX)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

export function highlightParts(content: string, query: string): HighlightPart[] {
  const text = snippet(content.replace(/\s+/g, ' ').trim(), query)
  if (!query) return [{ text, match: false }]
  const lower = text.toLowerCase()
  const needle = query.toLowerCase()
  const parts: HighlightPart[] = []
  let from = 0
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), match: false })
    parts.push({ text: text.slice(at, at + needle.length), match: true })
    from = at + needle.length
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false })
  return parts
}

export function messageSnippet(message: Message, query: string): HighlightPart[] {
  const plain = mentionsToPlain(message.content, (id) => message.mentions?.find((m) => m.accountId === id)?.name)
  if (!plain.trim()) return [{ text: message.attachments.length > 0 ? '📎 anexo' : '', match: false }]
  return highlightParts(plain, query)
}
