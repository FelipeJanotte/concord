/**
 * Menu de botão direito sobre uma pessoa (tile da sala de voz e lista da barra lateral):
 * volume da voz, silenciar só para mim, cargos (B5, só para quem gerencia membros), moderação da
 * voz (B6: silenciar para todos e expulsar, `ModerationMenu`) e ver o perfil.
 *
 * Item futuro: "Mensagem" (B7/A7, abre a DM com a pessoa).
 */
import { useState, type ReactNode } from 'react'
import { Shield, User as UserIcon, Volume2, VolumeX } from 'lucide-react'
import { EVERYONE_ROLE_ID } from '@shared/types'
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { RoleDot } from '@/components/settings/RoleDot'
import { UserProfileDialog } from '@/components/UserProfileDialog'
import { ModerationItems } from './ModerationMenu'
import { notify, setMemberRoles, setUserMuted, setUserVolume } from '@/lib/client'
import { canAssignRole, canEditMember, memberRoleIds, rolesByPosition } from '@/lib/permissions'
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
              <ModerationItems accountId={user.accountId} name={user.name} />
              <ContextMenuSeparator />
            </>
          )}
          <RolesSubmenu accountId={user.accountId} />
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

/** Submenu "Cargos": marcar/desmarcar dá ou tira o cargo na hora. Só aparece para quem pode mexer nos cargos da pessoa. */
function RolesSubmenu({ accountId }: { accountId: string }) {
  const access = useApp((s) => s.access)
  const me = useApp((s) => s.self?.accountId)
  if (!access || !me || !canEditMember(access, me, accountId)) return null
  const roles = rolesByPosition(access).filter((r) => r.id !== EVERYONE_ROLE_ID && canAssignRole(access, me, r))
  if (roles.length === 0) return null
  const current = memberRoleIds(access, accountId)

  function toggle(roleId: string, on: boolean) {
    const next = on ? [...current, roleId] : current.filter((id) => id !== roleId)
    setMemberRoles(accountId, next).catch((err: unknown) =>
      notify(err instanceof Error ? err.message : 'Não foi possível mudar os cargos')
    )
  }

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Shield />
        Cargos
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-52" aria-label="Cargos">
        {roles.map((role) => (
          <ContextMenuCheckboxItem
            key={role.id}
            checked={current.includes(role.id)}
            onCheckedChange={(checked) => toggle(role.id, checked === true)}
            onSelect={(e) => e.preventDefault()}
          >
            <RoleDot color={role.color} />
            <span className="truncate">{role.name}</span>
          </ContextMenuCheckboxItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
