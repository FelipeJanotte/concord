import { useEffect } from 'react'
import { Loader2, MessageSquare } from 'lucide-react'
import { restoreSession } from '@/lib/client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ChannelSidebar } from '@/components/ChannelSidebar'
import { IncomingCall } from '@/components/call/IncomingCall'
import { ChatView } from '@/components/ChatView'
import { FriendsView } from '@/components/friends/FriendsView'
import { HomeSidebar } from '@/components/home/HomeSidebar'
import { LoginScreen } from '@/components/LoginScreen'
import { MemberList } from '@/components/MemberList'
import { UtilityRail } from '@/components/rail/UtilityRail'
import { Toast } from '@/components/Toast'
import { ToolView } from '@/components/tools/ToolView'
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
      {self && <IncomingCall />}
      <Toast />
    </TooltipProvider>
  )
}

function MainLayout() {
  const view = useApp((s) => s.view)
  const status = useApp((s) => s.status)
  const section = useApp((s) => s.section)
  const homeView = useApp((s) => s.homeView)

  return (
    <div className="flex h-full flex-col">
      {status === 'reconnecting' && (
        <div className="flex h-7 shrink-0 items-center justify-center gap-2 bg-destructive text-xs font-medium text-white">
          <Loader2 className="size-3.5 animate-spin" />
          Conexão perdida — tentando reconectar...
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden select-none">
        <UtilityRail />
        {/* ferramenta aberta: a barra de canais continua como contexto (canal/sala atual) */}
        {section === 'home' ? <HomeSidebar /> : <ChannelSidebar />}
        <main className="flex min-w-0 flex-1 flex-col bg-background">
          {section === 'tool' ? (
            <ToolView />
          ) : section === 'home' ? (
            homeView.kind === 'dm' ? (
              <ChatView key={homeView.channelId} channelId={homeView.channelId} />
            ) : (
              <FriendsView />
            )
          ) : view?.kind === 'voice' ? (
            <VoiceView key={view.channelId} channelId={view.channelId} />
          ) : view?.kind === 'text' ? (
            <ChatView key={view.channelId} channelId={view.channelId} />
          ) : (
            <EmptyState />
          )}
        </main>
        {section === 'community' && <MemberList />}
      </div>
    </div>
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
