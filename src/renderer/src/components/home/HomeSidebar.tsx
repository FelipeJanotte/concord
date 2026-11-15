// Barra lateral da Home (B7): botão "Amigos" (com os pedidos recebidos) e a lista de conversas.
import { Users } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { showFriends } from '@/lib/client'
import { incomingCount } from '@/lib/friends'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { DmList } from '../dm/DmList'
import { UserPanel, VoiceStatusPanel } from '../UserPanel'

export function HomeSidebar() {
  const onFriends = useApp((s) => s.section === 'home' && s.homeView.kind === 'friends')
  const pending = useApp((s) => incomingCount(s.friends))

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-sidebar">
      <header className="flex h-12 shrink-0 items-center border-b border-black/25 px-4 font-semibold text-accent-foreground shadow-sm">
        Início
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-2 py-3">
          <button
            onClick={showFriends}
            aria-current={onFriends ? 'page' : undefined}
            className={cn(
              'flex h-10 w-full items-center gap-3 rounded-md px-2 text-left font-medium text-sidebar-foreground outline-none hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
              onFriends && 'bg-accent text-accent-foreground hover:bg-accent'
            )}
          >
            <Users className="size-5" />
            <span className="flex-1">Amigos</span>
            {pending > 0 && (
              <span
                aria-label={`${pending} pedido(s) de amizade`}
                className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white"
              >
                {pending}
              </span>
            )}
          </button>
          <div>
            <h2 className="mb-1 px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Mensagens diretas
            </h2>
            <DmList />
          </div>
        </div>
      </ScrollArea>
      <VoiceStatusPanel />
      <UserPanel />
    </aside>
  )
}
