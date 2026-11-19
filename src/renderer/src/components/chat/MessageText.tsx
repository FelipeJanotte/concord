import { Fragment, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { MENTION_EVERYONE, type Message } from '@shared/types'
import { splitLinks } from '@shared/links'
import { parseMarkdown, type MarkdownNode } from '@shared/markdown'
import { splitMentions } from '@/lib/mentions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

type NameOf = (accountId: string) => string

function withLinks(text: string, key: string | number): ReactNode {
  const parts = splitLinks(text)
  if (!parts.some((p) => 'url' in p)) return <Fragment key={key}>{text}</Fragment>
  return (
    <Fragment key={key}>
      {parts.map((p, i) =>
        'text' in p ? (
          <Fragment key={i}>{p.text}</Fragment>
        ) : (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noreferrer noopener"
            title={p.href}
            className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            {p.url}
          </a>
        )
      )}
    </Fragment>
  )
}

function PlainText({ text, me, nameOf }: { text: string; me: string | undefined; nameOf: NameOf }) {
  return (
    <>
      {splitMentions(text).map((p, i) => {
        if ('text' in p) return withLinks(p.text, i)
        const everyone = p.mention === MENTION_EVERYONE
        const isMe = everyone || p.mention === me
        return (
          <span
            key={i}
            data-mention={p.mention}
            className={cn('rounded px-0.5 font-medium', isMe ? 'bg-primary/40 text-accent-foreground' : 'bg-primary/20 text-accent-foreground')}
          >
            @{everyone ? 'todos' : nameOf(p.mention)}
          </span>
        )
      })}
    </>
  )
}

function Spoiler({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false)
  if (revealed) {
    return (
      <span data-revealed="true" className="rounded bg-accent px-0.5">
        {children}
      </span>
    )
  }
  const reveal = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setRevealed(true)
  }
  const revealByKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    setRevealed(true)
  }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Spoiler: clique para ver"
      title="Spoiler: clique para ver"
      data-revealed="false"
      onClickCapture={reveal}
      onKeyDown={revealByKey}
      className="cursor-pointer rounded bg-foreground px-0.5 text-transparent select-none hover:bg-foreground/80 [&_*]:invisible"
    >
      {children}
    </span>
  )
}

function renderNodes(nodes: MarkdownNode[], me: string | undefined, nameOf: NameOf): ReactNode[] {
  return nodes.map((node, i) => renderNode(node, i, me, nameOf))
}

function renderNode(node: MarkdownNode, key: number, me: string | undefined, nameOf: NameOf): ReactNode {
  switch (node.type) {
    case 'text':
      return <PlainText key={key} text={node.text} me={me} nameOf={nameOf} />
    case 'code':
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {node.text}
        </code>
      )
    case 'codeBlock':
      return (
        <code key={key} data-code-block className="my-1 block rounded border border-border bg-muted p-2 font-mono text-[13px] leading-[18px] whitespace-pre-wrap">
          {node.text}
        </code>
      )
    case 'quote':
      return (
        <span key={key} data-quote className="my-0.5 block border-l-4 border-muted-foreground/50 pl-3">
          {renderNodes(node.children, me, nameOf)}
        </span>
      )
    case 'bold':
      return <strong key={key}>{renderNodes(node.children, me, nameOf)}</strong>
    case 'italic':
      return <em key={key}>{renderNodes(node.children, me, nameOf)}</em>
    case 'strike':
      return <s key={key}>{renderNodes(node.children, me, nameOf)}</s>
    case 'spoiler':
      return <Spoiler key={key}>{renderNodes(node.children, me, nameOf)}</Spoiler>
  }
}

export function MessageText({ message }: { message: Message }) {
  const me = useApp((s) => s.self?.accountId)
  const users = useApp((s) => s.users)

  const nameOf: NameOf = (id) =>
    message.mentions?.find((m) => m.accountId === id)?.name ?? users.find((u) => u.accountId === id)?.name ?? 'alguém'

  return <>{renderNodes(parseMarkdown(message.content), me, nameOf)}</>
}
