export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'bold' | 'italic' | 'strike' | 'spoiler'; children: InlineNode[] }

export type MarkdownNode = InlineNode | { type: 'codeBlock'; text: string } | { type: 'quote'; children: InlineNode[] }

type WrapperType = 'bold' | 'italic' | 'strike' | 'spoiler'

const WRAPPERS: ReadonlyArray<readonly [string, WrapperType]> = [
  ['||', 'spoiler'],
  ['**', 'bold'],
  ['~~', 'strike'],
  ['*', 'italic']
]

const CODE_BLOCK = /```(?:[\w+#-]*\n)?([\s\S]+?)```/g
const QUOTE_LINE = /^> |^>$/
const LOOSE_ITALIC_EDGE = /^[\s*]|[\s*]$/

function closingBacktick(s: string, open: number): number {
  const close = s.indexOf('`', open + 1)
  return close > open + 1 ? close : -1
}

function findClose(s: string, from: number, mark: string): number {
  let j = from
  while (j < s.length) {
    if (s[j] === '`') {
      const close = closingBacktick(s, j)
      if (close !== -1) {
        j = close + 1
        continue
      }
    }
    if (mark === '*' && s.startsWith('**', j)) {
      j += 2
      continue
    }
    if (s.startsWith(mark, j)) {
      while (mark === '**' && s[j + 2] === '*') j++
      return j
    }
    j++
  }
  return -1
}

function wrapperAt(s: string, i: number): { node: InlineNode; end: number } | null {
  for (const [mark, type] of WRAPPERS) {
    if (!s.startsWith(mark, i)) continue
    const start = i + mark.length
    const close = findClose(s, start, mark)
    if (close === -1) continue
    const inner = s.slice(start, close)
    if (!inner || (type === 'italic' && LOOSE_ITALIC_EDGE.test(inner))) continue
    return { node: { type, children: parseInline(inner) }, end: close + mark.length }
  }
  return null
}

function nodeAt(s: string, i: number): { node: InlineNode; end: number } | null {
  if (s[i] !== '`') return wrapperAt(s, i)
  const close = closingBacktick(s, i)
  return close === -1 ? null : { node: { type: 'code', text: s.slice(i + 1, close) }, end: close + 1 }
}

function parseInline(s: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let plain = ''
  let i = 0
  while (i < s.length) {
    const found = nodeAt(s, i)
    if (!found) {
      plain += s[i++]
      continue
    }
    if (plain) nodes.push({ type: 'text', text: plain })
    plain = ''
    nodes.push(found.node)
    i = found.end
  }
  if (plain) nodes.push({ type: 'text', text: plain })
  return nodes
}

function parseLines(segment: string): MarkdownNode[] {
  const groups: Array<{ quote: boolean; lines: string[] }> = []
  for (const line of segment.split('\n')) {
    const quote = QUOTE_LINE.test(line)
    const last = groups.at(-1)
    const content = quote ? line.slice(2) : line
    if (last && last.quote === quote) last.lines.push(content)
    else groups.push({ quote, lines: [content] })
  }
  return groups.flatMap((g): MarkdownNode[] => {
    const children = parseInline(g.lines.join('\n'))
    return g.quote ? [{ type: 'quote', children }] : children
  })
}

export function parseMarkdown(content: string): MarkdownNode[] {
  const nodes: MarkdownNode[] = []
  let last = 0
  for (const m of content.matchAll(CODE_BLOCK)) {
    nodes.push(...parseLines(content.slice(last, m.index).replace(/\n$/, '')))
    nodes.push({ type: 'codeBlock', text: m[1].replace(/\n$/, '') })
    last = m.index + m[0].length
    if (content[last] === '\n') last++
  }
  nodes.push(...parseLines(content.slice(last)))
  return nodes
}
