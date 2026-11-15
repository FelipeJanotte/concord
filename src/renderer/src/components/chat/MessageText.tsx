// Texto da mensagem com as menções desenhadas como "@Nome" (B19). A menção a mim (ou @todos)
// fica mais forte. Nome: o que veio do servidor; senão, o de quem está online; senão "@alguém".
import { Fragment } from 'react'
import { MENTION_EVERYONE, type Message } from '@shared/types'
import { splitMentions } from '@/lib/mentions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

export function MessageText({ message }: { message: Message }) {
  const me = useApp((s) => s.self?.accountId)
  const users = useApp((s) => s.users)
  const parts = splitMentions(message.content)
  if (!parts.some((p) => 'mention' in p)) return <>{message.content}</>

  const nameOf = (id: string): string =>
    message.mentions?.find((m) => m.accountId === id)?.name ?? users.find((u) => u.accountId === id)?.name ?? 'alguém'

  return (
    <>
      {parts.map((p, i) => {
        if ('text' in p) return <Fragment key={i}>{p.text}</Fragment>
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
