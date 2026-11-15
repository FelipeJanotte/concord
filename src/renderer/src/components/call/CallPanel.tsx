/**
 * Painel da chamada no topo da conversa privada (B8): chamando / tocando / em andamento.
 * Em andamento mostra a grade da sala da conversa (mesma `VoiceGrid` das salas, com a tela
 * compartilhada) e os controles de microfone, áudio, tela, efeitos sonoros e desligar.
 */
import type { ReactNode } from 'react'
import { AudioLines, HeadphoneOff, Headphones, Mic, MicOff, MonitorOff, MonitorUp, Music, Phone, PhoneOff } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { DmEntry } from '@shared/types'
import { Button } from '@/components/ui/button'
import {
  acceptCall,
  cancelCall,
  declineCall,
  hangUp,
  joinVoice,
  notify,
  openDeviceSettings,
  openSoundboard,
  toggleDeafen,
  toggleMute,
  toggleScreenShare
} from '@/lib/client'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { UserAvatar } from '../UserAvatar'
import { ControlButton } from '../VoiceView'
import { PushToTalkHint } from '../voice/PushToTalk'
import { SoundsPlayingBar } from '../voice/Soundboard'
import { VoiceGrid } from '../voice/VoiceGrid'

/**
 * Linha dos botões redondos. A conversa privada pode ficar estreita (janela pequena, barras laterais):
 * os botões não encolhem (senão viram ovais "achatados") e, sem espaço, quebram para a linha de baixo.
 */
const CONTROLS_ROW = 'flex flex-wrap items-center justify-center gap-3 px-4 [&>button]:shrink-0'

function report(action: Promise<void>, fallback: string): void {
  action.catch((err: unknown) => notify(err instanceof Error ? err.message : fallback))
}

export function CallPanel({ dm }: { dm: DmEntry }) {
  const channelId = dm.channel.id
  const call = useApp((s) => s.calls[channelId])
  const me = useApp((s) => s.self?.accountId)
  const inRoom = useApp((s) => s.myVoiceChannelId === channelId)
  const members = useApp(useShallow((s) => s.voice.filter((v) => v.channelId === channelId)))

  if (!call) return null
  const iCalled = call.callerId === me
  const name = dm.other.name

  if (call.status === 'ringing') {
    return (
      <Frame>
        <div className="flex flex-col items-center gap-3 py-6">
          <UserAvatar user={dm.other} size="xl" className="animate-pulse" />
          <p className="text-lg font-semibold text-accent-foreground">
            {iCalled ? `Chamando ${name}...` : `${name} está ligando...`}
          </p>
          <div className={CONTROLS_ROW}>
            {iCalled ? (
              <ControlButton label="Cancelar chamada" danger onClick={() => report(cancelCall(channelId), 'Não foi possível cancelar')}>
                <PhoneOff />
              </ControlButton>
            ) : (
              <>
                <ControlButton label="Atender" active onClick={() => report(acceptCall(channelId), 'Não foi possível atender')}>
                  <Phone />
                </ControlButton>
                <ControlButton label="Recusar" danger onClick={() => report(declineCall(channelId), 'Não foi possível recusar')}>
                  <PhoneOff />
                </ControlButton>
              </>
            )}
          </div>
        </div>
      </Frame>
    )
  }

  return (
    <Frame>
      <div className="max-h-[50vh] overflow-y-auto p-4">
        {members.length > 0 ? (
          <VoiceGrid members={members} fill={false} />
        ) : (
          <p className="py-6 text-center text-muted-foreground">Ninguém na chamada ainda.</p>
        )}
      </div>
      {inRoom && <SoundsPlayingBar />}
      {inRoom && <PushToTalkHint />}
      <div className={cn(CONTROLS_ROW, 'pb-4')}>
        {inRoom ? (
          <InCallControls onHangUp={() => report(hangUp(channelId), 'Não foi possível desligar')} />
        ) : (
          // atendida em outra janela (ou saí da sala sem desligar): dá para entrar de novo
          <Button onClick={() => void joinVoice(channelId)} className="rounded-full bg-success px-6 hover:bg-success/90">
            <Phone />
            Entrar na chamada
          </Button>
        )}
      </div>
    </Frame>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Chamada" className="shrink-0 border-b border-black/25 bg-rail">
      {children}
    </section>
  )
}

function InCallControls({ onHangUp }: { onHangUp: () => void }) {
  const muted = useApp((s) => s.muted || s.noMic || !s.voiceCanSpeak)
  const deafened = useApp((s) => s.deafened)
  const canShare = useApp((s) => s.voiceCanShare)
  const sharing = useApp((s) => s.sharing)
  return (
    <>
      <ControlButton label={muted ? 'Ativar microfone' : 'Silenciar'} onClick={toggleMute} off={muted}>
        {muted ? <MicOff /> : <Mic />}
      </ControlButton>
      <ControlButton label={deafened ? 'Ativar áudio' : 'Desativar áudio'} onClick={toggleDeafen} off={deafened}>
        {deafened ? <HeadphoneOff /> : <Headphones />}
      </ControlButton>
      {canShare && (
        <ControlButton label={sharing ? 'Parar de compartilhar' : 'Compartilhar a tela'} onClick={toggleScreenShare} active={sharing}>
          {sharing ? <MonitorOff /> : <MonitorUp />}
        </ControlButton>
      )}
      {/* efeitos sonoros da comunidade também na chamada (só a outra pessoa ouve) */}
      <ControlButton label="Efeitos sonoros" onClick={openSoundboard}>
        <Music />
      </ControlButton>
      <ControlButton label="Configurações de voz" onClick={openDeviceSettings}>
        <AudioLines />
      </ControlButton>
      <ControlButton label="Desligar" danger onClick={onHangUp}>
        <PhoneOff />
      </ControlButton>
    </>
  )
}
