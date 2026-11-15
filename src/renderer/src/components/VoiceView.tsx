import type { ReactNode } from 'react'
import { AudioLines, HeadphoneOff, Video, VideoOff, Headphones, Loader2, Mic, MicOff, MonitorOff, MonitorUp, Music, PhoneOff, Volume2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { joinVoice, leaveVoice, openDeviceSettings, openSoundboard, toggleCamera, toggleDeafen, toggleMute, toggleScreenShare } from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { ScreenPicker } from './voice/ScreenPicker'
import { Soundboard, SoundsPlayingBar } from './voice/Soundboard'
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

  if (!channel) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-rail">
      <header className="flex h-12 shrink-0 items-center gap-2 px-4">
        <Volume2 className="size-6 text-muted-foreground" />
        <h1 className="font-semibold text-accent-foreground">{channel.name}</h1>
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
      <div className="flex shrink-0 items-center justify-center gap-3 pb-6">
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
                {cameraOn ? <VideoOff /> : <Video />}
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
      <ScreenPicker />
      <Soundboard />
    </div>
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
            'flex size-14 items-center justify-center rounded-full bg-secondary text-white transition-colors hover:bg-secondary/80 [&_svg]:size-6',
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
