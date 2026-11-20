import { splitLinks } from '../../src/shared/links'
import { parseMarkdown, type MarkdownNode } from '../../src/shared/markdown'

function visibleText(nodes: MarkdownNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.text
      if (node.type === 'bold' || node.type === 'italic' || node.type === 'strike' || node.type === 'quote') return visibleText(node.children)
      return ' '
    })
    .join(' ')
}

export function firstPreviewLink(content: string): string | null {
  for (const part of splitLinks(visibleText(parseMarkdown(content)))) {
    if ('href' in part) return part.href
  }
  return null
}
