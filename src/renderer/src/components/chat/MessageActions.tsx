/**
 * Ações sobre uma mensagem, ao passar o mouse (B6): apagar. Aparece para o autor e, fora das
 * conversas privadas, para quem tem "Gerenciar mensagens" (mesma regra do servidor).
 */
import { Trash2 } from 'lucide-react'
import { canDeleteMessage, type Message } from '@shared/types'
import { deleteMessage, notify } from '@/lib/client'
import { findDm } from '@/lib/dms'
import { useApp } from '@/store'

export function MessageActions({ message }: { message: Message }) {
  const allowed = useApp((s) => {
    const me = s.self?.accountId
    if (!me) return false
    const isAuthor = message.author.accountId === me
    // conversa privada: sem moderação, só o autor
    const isDm = !!findDm(s.dms, message.channelId)
    if (isDm || !s.access) return isAuthor
    return canDeleteMessage(s.access, me, message.author.accountId)
  })
  if (!allowed) return null

  function remove() {
    if (!window.confirm('Apagar esta mensagem? Isso não pode ser desfeito.')) return
    deleteMessage(message.id).catch((err: unknown) =>
      notify(err instanceof Error ? err.message : 'Não foi possível apagar a mensagem')
    )
  }

  return (
    <div className="absolute -top-3 right-4 hidden rounded-md border border-border bg-panel shadow-sm group-hover:flex group-focus-within:flex">
      <button
        type="button"
        onClick={remove}
        aria-label="Apagar mensagem"
        title="Apagar mensagem"
        className="p-1.5 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}
