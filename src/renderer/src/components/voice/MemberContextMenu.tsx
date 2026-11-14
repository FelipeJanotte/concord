/**
 * Menu de botão direito sobre uma pessoa (tile da sala de voz e lista da barra lateral):
 * volume da voz, silenciar só para mim e ver o perfil.
 *
 * Itens futuros entram aqui: "Cargos" (B5, só para quem pode gerenciar membros) e
 * "Mensagem" (B7/A7, abre a DM com a pessoa).
 */
import { useState, type ReactNode } from 'react'
import { User as UserIcon, Volume2, VolumeX } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { UserProfileDialog } from '@/components/UserProfileDialog'
import { setUserMuted, setUserVolume } from '@/lib/client'
import { useApp } from '@/store'

export function MemberContextMenu({ userId, children }: { userId: string; children: ReactNode }) {
  const [profileOpen, setProfileOpen] = useState(false)
  const user = useApp((s) => s.users.find((u) => u.id === userId))
  const isSelf = useApp((s) => !!user && s.self?.accountId === user.accountId)

  if (!user) return <>{children}</>

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-60" aria-label={`Opções de ${user.name}`}>
          <ContextMenuLabel className="truncate">
            {user.name}
            <span className="font-normal text-muted-foreground">#{user.tag}</span>
          </ContextMenuLabel>
          <ContextMenuSeparator />
          {!isSelf && (
            <>
              <VolumeControl accountId={user.accountId} name={user.name} />
              <MuteItem accountId={user.accountId} />
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onSelect={() => setProfileOpen(true)}>
            <UserIcon />
            Ver perfil
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <UserProfileDialog userId={userId} open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  )
}

function VolumeControl({ accountId, name }: { accountId: string; name: string }) {
  const pct = useApp((s) => Math.round((s.userVolumes[accountId] ?? 1) * 100))
  const muted = useApp((s) => !!s.userMuted[accountId])
  return (
    // Não é item de menu: as setas mexem no controle em vez de navegar pelo menu.
    <div className="px-2 py-1.5" onKeyDown={(e) => e.stopPropagation()}>
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>Volume{muted && ' (silenciado)'}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        aria-label={`Volume de ${name}`}
        onChange={(e) => setUserVolume(accountId, Number(e.target.value) / 100)}
        className="w-full accent-primary"
      />
    </div>
  )
}

function MuteItem({ accountId }: { accountId: string }) {
  const muted = useApp((s) => !!s.userMuted[accountId])
  return (
    <ContextMenuCheckboxItem
      checked={muted}
      onCheckedChange={(checked) => setUserMuted(accountId, checked === true)}
      // Mantém o menu aberto: dá para silenciar e ajustar o volume na mesma vez.
      onSelect={(e) => e.preventDefault()}
    >
      {muted ? <VolumeX className="text-destructive" /> : <Volume2 />}
      Silenciar
    </ContextMenuCheckboxItem>
  )
}
