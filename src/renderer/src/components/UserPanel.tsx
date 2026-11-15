import { useEffect, useState, type ReactNode } from 'react'
import { AudioLines, HeadphoneOff, Headphones, Mic, MicOff, MonitorOff, MonitorUp, Music, Palette, PhoneOff, Settings, Signal, Video, VideoOff } from 'lucide-react'
import { joinVoice, leaveVoice, openDeviceSettings, openDmChat, openSoundboard, toggleCamera, toggleDeafen, toggleMute, toggleScreenShare } from '@/lib/client'
import { findDm } from '@/lib/dms'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { IconButton } from './IconButton'
import { ProfileDialog } from './ProfileDialog'
import { AppearanceDialog } from './settings/appearance/AppearanceDialog'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { UserAvatar } from './UserAvatar'
import { DeviceSettings } from './voice/DeviceSettings'
import { ScreenPicker } from './voice/ScreenPicker'
import { Soundboard } from './voice/Soundboard'

/**
 * "Voz conectada" em cima do painel da conta, em qualquer tela (chat de texto, Home, ferramentas):
 * a sala (clique volta para ela), Configurações de voz, Desconectar e a linha com câmera, compartilhar
 * a tela e efeitos sonoros, para não precisar voltar à sala. Microfone e áudio ficam no `UserPanel`.
 */
export function VoiceStatusPanel() {
  const channelId = useApp((s) => s.myVoiceChannelId)
  const channel = useApp((s) => s.channels.find((c) => c.id === s.myVoiceChannelId))
  // chamada de uma conversa (B8): o nome é o da outra pessoa e o clique abre a conversa
  const dm = useApp((s) => (s.myVoiceChannelId ? findDm(s.dms, s.myVoiceChannelId) : undefined))
  const canVideo = useApp((s) => s.voiceCanVideo)
  const cameraOn = useApp((s) => s.cameraOn)
  const canShare = useApp((s) => s.voiceCanShare)
  const sharing = useApp((s) => s.sharing)
  if (!channelId || (!channel && !dm)) return null

  return (
    <div className="space-y-2 border-b border-border/50 bg-panel px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-success">
            <Signal className="size-4" />
            Voz conectada
          </div>
          <button
            onClick={() => (dm ? openDmChat(channelId) : void joinVoice(channelId))}
            className="block max-w-full truncate text-xs text-muted-foreground hover:text-accent-foreground hover:underline"
          >
            {dm ? `Chamada com ${dm.other.name}` : channel?.name}
          </button>
        </div>
        <IconButton label="Configurações de voz" onClick={openDeviceSettings}>
          <AudioLines />
        </IconButton>
        <IconButton label="Desconectar" onClick={leaveVoice}>
          <PhoneOff />
        </IconButton>
      </div>
      <div className="flex gap-2">
        {canVideo && (
          <PanelButton label={cameraOn ? 'Desligar a câmera' : 'Ligar a câmera'} active={cameraOn} onClick={() => void toggleCamera()}>
            {cameraOn ? <VideoOff /> : <Video />}
          </PanelButton>
        )}
        {canShare && (
          <PanelButton label={sharing ? 'Parar de compartilhar' : 'Compartilhar a tela'} active={sharing} onClick={toggleScreenShare}>
            {sharing ? <MonitorOff /> : <MonitorUp />}
          </PanelButton>
        )}
        <PanelButton label="Efeitos sonoros" onClick={openSoundboard}>
          <Music />
        </PanelButton>
      </div>
    </div>
  )
}

/** Botão largo da linha de controles do "Voz conectada" (verde quando ligado). */
function PanelButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'flex h-8 flex-1 items-center justify-center rounded-md bg-secondary text-accent-foreground transition-colors hover:bg-secondary/80 [&_svg]:size-4',
            active && 'bg-success text-white hover:bg-success/90'
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function UserPanel() {
  const self = useApp((s) => s.self)
  const muted = useApp((s) => s.muted || s.noMic || (!!s.myVoiceChannelId && !s.voiceCanSpeak))
  const deafened = useApp((s) => s.deafened)
  const speaking = useApp((s) => (s.self ? !!s.speaking[s.self.id] : false))
  const [profileOpen, setProfileOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  // Conta nova do Google: abre o perfil para escolher o id definitivo.
  const mustChooseTag = useApp((s) => s.account?.tagLocked === false)
  useEffect(() => {
    if (mustChooseTag) setProfileOpen(true)
  }, [mustChooseTag])
  if (!self) return null

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-1 bg-panel px-2">
      <button
        onClick={() => setProfileOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pr-1 pl-0.5 text-left hover:bg-accent/50"
        title="Minha conta"
      >
        <div className="relative">
          <UserAvatar user={self} speaking={speaking} />
          <span className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-[3px] border-panel bg-success" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold text-accent-foreground">{self.name}</div>
          <div className="truncate text-xs text-muted-foreground">#{self.tag}</div>
        </div>
      </button>
      <IconButton label={muted ? 'Ativar microfone' : 'Silenciar microfone'} onClick={toggleMute} danger={muted}>
        {muted ? <MicOff /> : <Mic />}
      </IconButton>
      <IconButton label={deafened ? 'Ativar áudio' : 'Desativar áudio'} onClick={toggleDeafen} danger={deafened}>
        {deafened ? <HeadphoneOff /> : <Headphones />}
      </IconButton>
      <IconButton label="Minha conta" onClick={() => setProfileOpen(true)}>
        <Settings />
      </IconButton>
      <IconButton label="Aparência" onClick={() => setAppearanceOpen(true)}>
        <Palette />
      </IconButton>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <AppearanceDialog open={appearanceOpen} onOpenChange={setAppearanceOpen} />
      {/* Sempre montados (uma vez só, em qualquer tela): o microfone e a saída podem ser escolhidos antes
          de entrar numa sala, e compartilhar a tela / efeitos sonoros abrem também do chat de texto. */}
      <DeviceSettings />
      <ScreenPicker />
      <Soundboard />
    </div>
  )
}
