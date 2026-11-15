// Responder citando (B18): a citação em cima da mensagem (clicar rola até a original) e a faixa
// "Respondendo a Fulano" em cima do campo de mensagem.
import { CornerUpLeft, X } from 'lucide-react'
import { mentionsToPlain, type ReplyPreview } from '@shared/types'
import { cancelReply } from '@/lib/client'
import { useApp } from '@/store'

/** Id do elemento de cada mensagem no chat (para rolar até ela). */
export const messageElementId = (id: string): string => `msg-${id}`

/** Rola até a mensagem e pisca o fundo; se ela não está carregada, não faz nada. */
export function scrollToMessage(id: string): boolean {
  const el = document.getElementById(messageElementId(id))
  if (!el) return false
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  el.dataset.highlight = 'true'
  setTimeout(() => delete el.dataset.highlight, 1500)
  return true
}

/** O texto da citação com "@Nome" no lugar dos tokens de menção (nome de quem está online). */
function usePlain(content: string): string {
  const users = useApp((s) => s.users)
  return mentionsToPlain(content, (id) => users.find((u) => u.accountId === id)?.name)
}

export function ReplyQuote({ reply }: { reply: ReplyPreview }) {
  const text = usePlain(reply.content)
  if (reply.deleted) {
    return (
      <p className="mb-0.5 flex items-center gap-1 text-xs text-muted-foreground italic">
        <CornerUpLeft className="size-3" />
        Mensagem apagada
      </p>
    )
  }
  return (
    <button
      type="button"
      onClick={() => scrollToMessage(reply.id)}
      title="Ir para a mensagem"
      className="mb-0.5 flex max-w-full items-center gap-1 text-left text-xs text-muted-foreground hover:text-accent-foreground"
    >
      <CornerUpLeft className="size-3 shrink-0" />
      <span className="shrink-0 font-semibold">@{reply.authorName}</span>
      <span className="truncate">{text || '📎 anexo'}</span>
    </button>
  )
}

/** Faixa em cima do campo: com quem estou falando e o X para desistir. */
export function ReplyBanner({ channelId }: { channelId: string }) {
  const reply = useApp((s) => s.replyingTo[channelId])
  const text = usePlain(reply?.content ?? '')
  if (!reply) return null
  return (
    <div role="status" className="flex items-center gap-2 rounded-t-lg bg-panel px-3 py-1.5 text-sm text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">
        Respondendo a <strong className="text-accent-foreground">{reply.authorName}</strong>
        {text && <span className="ml-1">— {text}</span>}
      </span>
      <button type="button" aria-label="Cancelar resposta" onClick={() => cancelReply(channelId)} className="hover:text-accent-foreground">
        <X className="size-4" />
      </button>
    </div>
  )
}
