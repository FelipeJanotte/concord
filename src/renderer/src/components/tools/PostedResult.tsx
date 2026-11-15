// Último resultado postado pelo painel (B10): o aviso "Postado em #canal" e o mesmo cartão do chat.
// Lê a mensagem da store quando ela já chegou por `message:new` (a enquete atualiza ao vivo).
import type { Message } from '@shared/types'
import { useApp } from '@/store'
import { PostedNotice } from './shared'
import { ToolResultCard } from './ToolResultCard'

export function PostedResult({ message }: { message: Message | null }) {
  const live = useApp((s) => (message ? s.messages[message.channelId]?.find((m) => m.id === message.id) : undefined))
  if (!message) return null
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <PostedNotice message={message} />
      <ToolResultCard message={live ?? message} />
    </div>
  )
}
