import type { ReactNode } from 'react'
import { AudioLines, HeadphoneOff, Video, VideoOff, Headphones, Loader2, MessageSquare, Mic, MicOff, MonitorOff, MonitorUp, Music, PhoneOff, Volume2, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { joinVoice, leaveVoice, openDeviceSettings, openSoundboard, setVoiceChatOpen, toggleCamera, toggleDeafen, toggleMute, toggleScreenShare } from '@/lib/client'
import { SIDE_PANELS } from '@/lib/side-width'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { ChatView } from './ChatView'
import { ResizableSide } from './ResizableSide'
import { PushToTalkHint } from './voice/PushToTalk'
import { SoundsPlayingBar } from './voice/Soundboard'
import { VoiceGrid } from './voice/VoiceGrid'

export function VoiceView({ channelId }: { channelId: string }) {
  const channel = useApp((s) => s.channels.find((c) => c.id === channelId))
  const members = useApp(useShallow((s) => s.voice.filter((v) => v.channelId === channelId)))
  const connected = useApp((s) => s.myVoiceChannelId === channelId)
  const joining = useApp((s) => s.joiningVoice)
  const muted = useApp((s) => s.muted || s.noMic || !s.voiceCanSpeak)
  const canShare = useApp((s) => s.voiceCanShare)
  const deafened = useApp((s) => s.deafened)
  const sharing = useApp((s) => s.sharing)
  const canVideo = useApp((s) => s.voiceCanVideo)
  const cameraOn = useApp((s) => s.cameraOn)
  // chat de texto da sala (como no Discord), num painel ao lado
  const chatOpen = useApp((s) => s.voiceChatOpen)

  if (!channel) return null

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-rail">
        <header className="flex h-12 shrink-0 items-center gap-2 px-4">
          <Volume2 className="size-6 text-muted-foreground" />
          <h1 className="font-semibold text-accent-foreground">{channel.name}</h1>
          <VoiceChatButton channelId={channelId} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {members.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <h2 className="text-2xl font-bold text-accent-foreground">{channel.name}</h2>
              <p className="text-muted-foreground">Ninguém está aqui ainda.</p>
            </div>
          ) : (
            <VoiceGrid members={members} />
          )}
        </div>

        {connected && <SoundsPlayingBar />}
        {connected && <PushToTalkHint />}
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 px-4 pb-6">
          {connected ? (
            <>
              <ControlButton label={muted ? 'Ativar microfone' : 'Silenciar'} onClick={toggleMute} off={muted}>
                {muted ? <MicOff /> : <Mic />}
              </ControlButton>
              <ControlButton label={deafened ? 'Ativar áudio' : 'Desativar áudio'} onClick={toggleDeafen} off={deafened}>
                {deafened ? <HeadphoneOff /> : <Headphones />}
              </ControlButton>
              {canVideo && (
                <ControlButton label={cameraOn ? 'Desligar a câmera' : 'Ligar a câmera'} onClick={() => void toggleCamera()} active={cameraOn}>
                  {cameraOn ? <Video /> : <VideoOff />}
                </ControlButton>
              )}
              {canShare && (
                <ControlButton label={sharing ? 'Parar de compartilhar' : 'Compartilhar a tela'} onClick={toggleScreenShare} active={sharing}>
                  {sharing ? <MonitorOff /> : <MonitorUp />}
                </ControlButton>
              )}
              <ControlButton label="Efeitos sonoros" onClick={openSoundboard}>
                <Music />
              </ControlButton>
              <ControlButton label="Configurações de voz" onClick={openDeviceSettings}>
                <AudioLines />
              </ControlButton>
              <ControlButton label="Desconectar" onClick={leaveVoice} danger>
                <PhoneOff />
              </ControlButton>
            </>
          ) : (
            <Button size="lg" onClick={() => void joinVoice(channelId)} disabled={joining} className="rounded-full bg-success px-8 hover:bg-success/90">
              {joining && <Loader2 className="animate-spin" />}
              Entrar na sala de voz
            </Button>
          )}
        </div>
      </div>
      {chatOpen && (
        <ResizableSide panel={SIDE_PANELS.voiceChat} edge="left" label="Redimensionar o chat da sala">
          <VoiceChatPanel channelId={channelId} />
        </ResizableSide>
      )}
    </div>
  )
}

/** Botão "Chat" no topo da sala (com a bolinha de mensagem nova enquanto o painel está fechado). */
function VoiceChatButton({ channelId }: { channelId: string }) {
  const open = useApp((s) => s.voiceChatOpen)
  const unread = useApp((s) => !!s.unread[channelId])
  const label = open ? 'Fechar o chat' : unread ? 'Abrir o chat (mensagens novas)' : 'Abrir o chat'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => setVoiceChatOpen(!open)}
          aria-label={label}
          aria-pressed={open}
          className={cn(
            'relative ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground [&_svg]:size-5',
            open && 'text-accent-foreground'
          )}
        >
          <MessageSquare />
          {unread && !open && <span data-testid="voice-chat-unread" className="absolute top-1 right-1 size-2 rounded-full bg-destructive" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Painel "Chat" ao lado da sala: o chat de texto do canal de voz (mesmo `ChatView` dos canais de texto). */
function VoiceChatPanel({ channelId }: { channelId: string }) {
  return (
    <aside aria-label="Chat da sala" className="flex min-w-0 flex-1 flex-col border-l border-border bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-black/25 px-4 shadow-sm">
        <MessageSquare className="size-5 text-muted-foreground" />
        <span className="font-semibold text-accent-foreground">Chat</span>
        <button
          type="button"
          onClick={() => setVoiceChatOpen(false)}
          aria-label="Fechar o chat"
          className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground [&_svg]:size-5"
        >
          <X />
        </button>
      </div>
      <ChatView channelId={channelId} embedded />
    </aside>
  )
}

/** Botão redondo dos controles da sala (também usado no painel da chamada da conversa, B8). */
export function ControlButton({
  label,
  onClick,
  off,
  active,
  danger,
  children
}: {
  label: string
  onClick: () => void
  off?: boolean
  /** ligado (ex.: compartilhando a tela, câmera ligada) */
  active?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'flex size-14 shrink-0 items-center justify-center rounded-full bg-secondary text-white transition-colors hover:bg-secondary/80 [&_svg]:size-6',
            off && 'bg-white text-black hover:bg-white/90',
            active && 'bg-success hover:bg-success/90',
            danger && 'bg-destructive hover:bg-destructive/90'
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
