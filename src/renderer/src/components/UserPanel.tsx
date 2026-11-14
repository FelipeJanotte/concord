import { useEffect, useState } from 'react'
import { AudioLines, HeadphoneOff, Headphones, Mic, MicOff, PhoneOff, Settings, Signal } from 'lucide-react'
import { joinVoice, leaveVoice, openDeviceSettings, toggleDeafen, toggleMute } from '@/lib/client'
import { useApp } from '@/store'
import { IconButton } from './IconButton'
import { ProfileDialog } from './ProfileDialog'
import { UserAvatar } from './UserAvatar'
import { DeviceSettings } from './voice/DeviceSettings'

export function VoiceStatusPanel() {
  const channelId = useApp((s) => s.myVoiceChannelId)
  const channel = useApp((s) => s.channels.find((c) => c.id === s.myVoiceChannelId))
  if (!channelId || !channel) return null

  return (
    <div className="flex items-center gap-2 border-b border-border/50 bg-panel px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-success">
          <Signal className="size-4" />
          Voz conectada
        </div>
        <button
          onClick={() => void joinVoice(channelId)}
          className="block max-w-full truncate text-xs text-muted-foreground hover:text-accent-foreground hover:underline"
        >
          {channel.name}
        </button>
      </div>
      <IconButton label="Configurações de voz" onClick={openDeviceSettings}>
        <AudioLines />
      </IconButton>
      <IconButton label="Desconectar" onClick={leaveVoice}>
        <PhoneOff />
      </IconButton>
    </div>
  )
}

export function UserPanel() {
  const self = useApp((s) => s.self)
  const muted = useApp((s) => s.muted || s.noMic || (!!s.myVoiceChannelId && !s.voiceCanSpeak))
  const deafened = useApp((s) => s.deafened)
  const speaking = useApp((s) => (s.self ? !!s.speaking[s.self.id] : false))
  const [profileOpen, setProfileOpen] = useState(false)
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
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      {/* Sempre montado: o microfone e a saída podem ser escolhidos antes de entrar numa sala. */}
      <DeviceSettings />
    </div>
  )
}
