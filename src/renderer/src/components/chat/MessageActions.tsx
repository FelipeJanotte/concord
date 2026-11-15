/**
 * Ações sobre uma mensagem, ao passar o mouse:
 * - Reagir (A16) e Responder (B18): quem pode mandar mensagem no canal;
 * - Editar (A15): o autor, só mensagem de texto;
 * - Apagar (B6): o autor e, fora das conversas privadas, quem tem "Gerenciar mensagens" (mesma regra do servidor).
 */
import { CornerUpLeft, Pencil, SmilePlus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { canDeleteMessage, type Message } from '@shared/types'
import { deleteMessage, notify, openReactionPicker, startEdit, startReply } from '@/lib/client'
import { findDm } from '@/lib/dms'
import { useCan } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'

export function MessageActions({ message }: { message: Message }) {
  const isAuthor = useApp((s) => !!s.self && message.author.accountId === s.self.accountId)
  const canRemove = useApp((s) => {
    const me = s.self?.accountId
    if (!me) return false
    // conversa privada: sem moderação, só o autor
    if (findDm(s.dms, message.channelId) || !s.access) return message.author.accountId === me
    return canDeleteMessage(s.access, me, message.author.accountId)
  })
  const canReply = useCan('send', message.channelId)
  const canEdit = isAuthor && (message.kind ?? 'text') === 'text'
  if (!canReply && !canEdit && !canRemove) return null

  function remove() {
    if (!window.confirm('Apagar esta mensagem? Isso não pode ser desfeito.')) return
    deleteMessage(message.id).catch((err: unknown) => notify(err instanceof Error ? err.message : 'Não foi possível apagar a mensagem'))
  }

  return (
    <div className="absolute -top-3 right-4 z-10 hidden rounded-md border border-border bg-panel shadow-sm group-hover:flex group-focus-within:flex">
      {canReply && (
        <ActionButton label="Adicionar reação" onClick={() => openReactionPicker(message.id)}>
          <SmilePlus className="size-4" />
        </ActionButton>
      )}
      {canReply && (
        <ActionButton label="Responder" onClick={() => startReply(message)}>
          <CornerUpLeft className="size-4" />
        </ActionButton>
      )}
      {canEdit && (
        <ActionButton label="Editar mensagem" onClick={() => startEdit(message.id)}>
          <Pencil className="size-4" />
        </ActionButton>
      )}
      {canRemove && (
        <ActionButton label="Apagar mensagem" onClick={remove} danger>
          <Trash2 className="size-4" />
        </ActionButton>
      )}
    </div>
  )
}

function ActionButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn('p-1.5 text-muted-foreground', danger ? 'hover:text-destructive' : 'hover:text-accent-foreground')}
    >
      {children}
    </button>
  )
}
