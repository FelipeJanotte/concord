import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from '@ui-sdk/react/menu'
import { AudioLines, HeadphoneOff, Headphones, Mic, MicOff, MonitorOff, MonitorUp, Music, PhoneOff, Settings, Signal, Video, VideoOff } from 'lucide-react'
import { joinVoice, leaveVoice, notify, openDeviceSettings, openDmChat, openSettings, setCustomStatus, setDoNotDisturb, toggleCamera, toggleDeafen, toggleMute, toggleScreenShare } from '@/lib/client'
import { useActiveCustomStatus } from '@/lib/custom-status'
import { findDm } from '@/lib/dms'
import { usePresence, type DotStatus } from '@/lib/presence'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { CustomStatusDialog } from './CustomStatusDialog'
import { IconButton } from './IconButton'
import { UserSettingsDialog } from './settings/UserSettingsDialog'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { StatusDot, UserAvatar } from './UserAvatar'
import { ScreenPicker } from './voice/ScreenPicker'
import { ScreenViewers } from './voice/ScreenViewers'
import { ScreenQualitySelect } from './voice/ScreenQualitySelect'
import { SoundboardPopover } from './voice/Soundboard'

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
  const selfId = useApp((s) => s.self?.id)
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
            {cameraOn ? <Video /> : <VideoOff />}
          </PanelButton>
        )}
        {canShare && (
          <PanelButton label={sharing ? 'Parar de compartilhar' : 'Compartilhar a tela'} active={sharing} onClick={toggleScreenShare}>
            {sharing ? <MonitorOff /> : <MonitorUp />}
          </PanelButton>
        )}
        <SoundboardPopover side="right">
          <PanelButton label="Efeitos sonoros">
            <Music />
          </PanelButton>
        </SoundboardPopover>
      </div>
      {sharing && <ScreenQualitySelect />}
      {sharing && selfId && <ScreenViewers userId={selfId} className="text-muted-foreground" />}
    </div>
  )
}

/** Botão largo da linha de controles do "Voz conectada" (verde quando ligado). */
function PanelButton({ label, active, children, ...buttonProps }: ComponentProps<'button'> & { label: string; active?: boolean; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          {...buttonProps}
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
  // Conta nova do Google: abre as Configurações em "Minha conta" para escolher o id definitivo.
  const mustChooseTag = useApp((s) => s.account?.tagLocked === false)
  useEffect(() => {
    if (mustChooseTag) openSettings('account')
  }, [mustChooseTag])
  const status = usePresence(self?.accountId ?? '')
  const [customStatusOpen, setCustomStatusOpen] = useState(false)
  if (!self) return null

  return (
    <div className="flex h-[52px] shrink-0 items-center gap-1 bg-panel px-2">
      <Menu>
        <MenuTrigger
          aria-label="Status e conta"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pr-1 pl-0.5 text-left hover:bg-accent/50 data-open:bg-accent/50"
        >
          <div className="relative">
            <UserAvatar user={self} speaking={speaking} />
            <StatusDot status={status} className="border-panel" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-accent-foreground">{self.name}</div>
            <div className="truncate text-xs text-muted-foreground">#{self.tag}</div>
          </div>
        </MenuTrigger>
        <StatusMenuContent onSetCustomStatus={() => setCustomStatusOpen(true)} />
      </Menu>
      <CustomStatusDialog open={customStatusOpen} onOpenChange={setCustomStatusOpen} />
      <IconButton label={muted ? 'Ativar microfone' : 'Silenciar microfone'} onClick={toggleMute} danger={muted}>
        {muted ? <MicOff /> : <Mic />}
      </IconButton>
      <IconButton label={deafened ? 'Ativar áudio' : 'Desativar áudio'} onClick={toggleDeafen} danger={deafened}>
        {deafened ? <HeadphoneOff /> : <Headphones />}
      </IconButton>
      <IconButton label="Configurações" onClick={() => openSettings()}>
        <Settings />
      </IconButton>
      {/* Sempre montados (uma vez só, em qualquer tela): as Configurações (conta, voz e vídeo, aparência,
          notificações; o microfone pode ser escolhido antes de entrar numa sala) e compartilhar a tela,
          que abre também do chat de texto. */}
      <UserSettingsDialog />
      <ScreenPicker />
    </div>
  )
}


const MENU_ITEM = 'flex w-full cursor-default items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground'

function StatusMenuContent({ onSetCustomStatus }: { onSetCustomStatus: () => void }) {
  const doNotDisturb = useApp((s) => s.doNotDisturb)
  const customStatus = useActiveCustomStatus(useApp((s) => s.account?.customStatus))
  const clearStatus = (): void => {
    setCustomStatus(null).catch((err: unknown) => notify(`Não foi possível limpar o status: ${err instanceof Error ? err.message : 'erro'}`))
  }

  return (
    <MenuContent side="top" align="start" sideOffset={8} data-glass="surface" className="w-64 rounded-md border border-border bg-popover p-1.5 text-popover-foreground shadow-md">
      <MenuRadioGroup value={doNotDisturb ? 'dnd' : 'online'} onValueChange={(value) => void setDoNotDisturb(value === 'dnd')}>
        <MenuRadioItem value="online" closeOnSelect className={MENU_ITEM}>
          <StatusOption status="online" label="Online" />
        </MenuRadioItem>
        <MenuRadioItem value="dnd" closeOnSelect className={MENU_ITEM}>
          <StatusOption status="dnd" label="Não perturbe" hint="Sem notificações nem sons de mensagem. Chamadas continuam tocando." />
        </MenuRadioItem>
      </MenuRadioGroup>
      <MenuSeparator className="my-1 h-px bg-border" />
      <MenuItem onSelect={onSetCustomStatus} className={MENU_ITEM}>
        Definir status personalizado
      </MenuItem>
      {customStatus && (
        <MenuItem onSelect={clearStatus} className={MENU_ITEM}>
          Limpar status
        </MenuItem>
      )}
      <MenuSeparator className="my-1 h-px bg-border" />
      <MenuItem onSelect={() => openSettings('account')} className={MENU_ITEM}>
        Minha conta
      </MenuItem>
    </MenuContent>
  )
}

function StatusOption({ status, label, hint }: { status: DotStatus; label: string; hint?: string }) {
  return (
    <>
      <span aria-hidden className="relative mt-1 size-2.5 shrink-0">
        <StatusDot status={status} className="inset-0 size-2.5 border-0" />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </>
  )
}
