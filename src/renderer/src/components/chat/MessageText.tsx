// Texto da mensagem com as menções desenhadas como "@Nome" (B19) e os links clicáveis. A menção a
// mim (ou @todos) fica mais forte. Nome: o que veio do servidor; senão, o de quem está online;
// senão "@alguém". O link abre no navegador padrão (o processo principal só aceita http/https).
import { Fragment, type ReactNode } from 'react'
import { MENTION_EVERYONE, type Message } from '@shared/types'
import { splitLinks } from '@shared/links'
import { splitMentions } from '@/lib/mentions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

/** Texto comum com os links viram `<a>`; sem link, o próprio texto. */
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

export function MessageText({ message }: { message: Message }) {
  const me = useApp((s) => s.self?.accountId)
  const users = useApp((s) => s.users)
  const parts = splitMentions(message.content)

  const nameOf = (id: string): string =>
    message.mentions?.find((m) => m.accountId === id)?.name ?? users.find((u) => u.accountId === id)?.name ?? 'alguém'

  return (
    <>
      {parts.map((p, i) => {
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
