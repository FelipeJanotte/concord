import { useEffect } from 'react'
import { Loader2, MessageSquare } from 'lucide-react'
import { restoreSession } from '@/lib/client'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ChannelSidebar } from '@/components/ChannelSidebar'
import { ChatView } from '@/components/ChatView'
import { LoginScreen } from '@/components/LoginScreen'
import { MemberList } from '@/components/MemberList'
import { Toast } from '@/components/Toast'
import { VoiceView } from '@/components/VoiceView'
import { useApp } from '@/store'

export default function App() {
  const self = useApp((s) => s.self)

  useEffect(() => {
    void restoreSession()
  }, [])

  return (
    <TooltipProvider delayDuration={150}>
      {self ? <MainLayout /> : <LoginScreen />}
      <Toast />
    </TooltipProvider>
  )
}

function MainLayout() {
  const view = useApp((s) => s.view)
  const status = useApp((s) => s.status)

  return (
    <div className="flex h-full flex-col">
      {status === 'reconnecting' && (
        <div className="flex h-7 shrink-0 items-center justify-center gap-2 bg-destructive text-xs font-medium text-white">
          <Loader2 className="size-3.5 animate-spin" />
          Conexão perdida — tentando reconectar...
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden select-none">
        <ServerRail />
        <ChannelSidebar />
        <main className="flex min-w-0 flex-1 flex-col bg-background">
          {view?.kind === 'voice' ? (
            <VoiceView key={view.channelId} channelId={view.channelId} />
          ) : view?.kind === 'text' ? (
            <ChatView key={view.channelId} channelId={view.channelId} />
          ) : (
            <EmptyState />
          )}
        </main>
        <MemberList />
      </div>
    </div>
  )
}

function ServerRail() {
  const serverUrl = useApp((s) => s.serverUrl)
  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-rail py-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <button className="relative flex size-12 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-white">
            <span className="absolute -left-3 h-10 w-1 rounded-r-full bg-white" />C
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <div className="font-semibold">Concord</div>
          <div className="text-xs text-muted-foreground">{serverUrl}</div>
        </TooltipContent>
      </Tooltip>
      <Separator className="mx-auto w-8" />
    </nav>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <MessageSquare className="size-12" />
      <p>Crie um canal de texto para começar a conversar.</p>
    </div>
  )
}
