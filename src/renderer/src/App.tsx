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
import { ResizableSide } from '@/components/ResizableSide'
import { UtilityRail } from '@/components/rail/UtilityRail'
import { TitleBar } from '@/components/TitleBar'
import { Toast } from '@/components/Toast'
import { ToolView } from '@/components/tools/ToolView'
import { UpdateBanner } from '@/components/UpdateBanner'
import { VoiceView } from '@/components/VoiceView'
import { SIDE_PANELS } from '@/lib/side-width'
import { useApp } from '@/store'

export default function App() {
  const self = useApp((s) => s.self)

  useEffect(() => {
    void restoreSession()
  }, [])

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="min-h-0 flex-1">{self ? <MainLayout /> : <LoginScreen />}</div>
      </div>
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
      <UpdateBanner />
      {status === 'reconnecting' && (
        <div className="flex h-7 shrink-0 items-center justify-center gap-2 bg-destructive text-xs font-medium text-white">
          <Loader2 className="size-3.5 animate-spin" />
          Conexão perdida — tentando reconectar...
        </div>
      )}
      <div data-glass="stage" className="flex min-h-0 flex-1 overflow-hidden select-none">
        <UtilityRail />
        <ResizableSide panel={SIDE_PANELS.navigation} edge="right" label="Redimensionar a barra lateral">
          {section === 'home' ? <HomeSidebar /> : <ChannelSidebar />}
        </ResizableSide>
        <main data-glass="panel" className="flex min-w-0 flex-1 flex-col bg-background">
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
        {section === 'community' && (
          <ResizableSide panel={SIDE_PANELS.members} edge="left" label="Redimensionar a lista de membros" className="hidden lg:flex">
            <MemberList />
          </ResizableSide>
        )}
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
