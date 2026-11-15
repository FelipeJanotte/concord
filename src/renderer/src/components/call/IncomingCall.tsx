/**
 * Chamada recebida (B8): cartão fixo no canto, por cima de qualquer tela, enquanto toca.
 * Some sozinho quando atendem (aqui ou em outra janela), recusam, cancelam ou o tempo acaba.
 * Não aparece se a conversa da chamada já está aberta (lá o painel da chamada mostra os botões).
 */
import { Phone, PhoneOff } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import type { CallInfo } from '@shared/types'
import { acceptCall, declineCall, notify } from '@/lib/client'
import { findDm } from '@/lib/dms'
import { useApp } from '@/store'
import { UserAvatar } from '../UserAvatar'

export function IncomingCall() {
  const incoming = useApp(
    useShallow((s) =>
      Object.values(s.calls).filter(
        (c) =>
          c.status === 'ringing' &&
          c.calleeId === s.self?.accountId &&
          !(s.section === 'home' && s.homeView.kind === 'dm' && s.homeView.channelId === c.channelId)
      )
    )
  )
  if (incoming.length === 0) return null
  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
      {incoming.map((call) => (
        <IncomingCard key={call.channelId} call={call} />
      ))}
    </div>
  )
}

function IncomingCard({ call }: { call: CallInfo }) {
  const dm = useApp((s) => findDm(s.dms, call.channelId))
  const name = dm?.other.name ?? 'Alguém'
  const fail = (err: unknown, fallback: string): void => notify(err instanceof Error ? err.message : fallback)

  return (
    <div role="alertdialog" aria-label={`Chamada de ${name}`} className="flex w-72 items-center gap-3 rounded-lg border border-border bg-panel p-3 shadow-lg">
      {dm && <UserAvatar user={dm.other} size="lg" className="animate-pulse" />}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-accent-foreground">{name}</div>
        <div className="text-xs text-muted-foreground">Chamada recebida...</div>
      </div>
      <button
        aria-label="Atender"
        onClick={() => acceptCall(call.channelId).catch((e: unknown) => fail(e, 'Não foi possível atender'))}
        className="flex size-10 items-center justify-center rounded-full bg-success text-white hover:bg-success/90"
      >
        <Phone className="size-5" />
      </button>
      <button
        aria-label="Recusar"
        onClick={() => declineCall(call.channelId).catch((e: unknown) => fail(e, 'Não foi possível recusar'))}
        className="flex size-10 items-center justify-center rounded-full bg-destructive text-white hover:bg-destructive/90"
      >
        <PhoneOff className="size-5" />
      </button>
    </div>
  )
}
