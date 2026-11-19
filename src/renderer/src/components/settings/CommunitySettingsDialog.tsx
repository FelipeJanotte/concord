/**
 * "Configurações da comunidade" (B5): criar, editar, ordenar e apagar cargos (aba Cargos) e
 * dar/tirar cargos das pessoas (aba Membros). Mostra só o que a pessoa pode mexer;
 * o servidor confere tudo de novo (hierarquia, `canGrantPermissions`).
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Loader2, Lock, Plus, Shield, Trash2, TriangleAlert } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import {
  can,
  canAssignRole,
  canChangeMemberRoles,
  canGrantPermissions,
  canManageRole,
  CHANNEL_PERMISSIONS,
  EVERYONE_ROLE_ID,
  GLOBAL_PERMISSIONS,
  hasFullAccess,
  PERMISSION_LABELS,
  reorderableRoles,
  type AccessState,
  type Permission,
  type Role,
  type User
} from '@shared/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createRole, deleteRole, reorderRoles, setMemberRoles, updateRole } from '@/lib/client'
import { memberRoleIds, rolesByPosition } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { BansTab } from './BansTab'
import { RoleDot } from './RoleDot'

export const ROLE_NAME_MAX = 32
const DEFAULT_COLOR = '#5865f2'
const ADMIN_WARNING_ID = 'role-administrator-warning'

type Tab = 'roles' | 'members' | 'bans'

export function CommunitySettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const access = useApp((s) => s.access)
  const me = useApp((s) => s.self?.accountId)
  const [tab, setTab] = useState<Tab>('roles')
  const seesBans = useApp((s) => !!s.access && !!s.self && can(s.access, s.self.accountId, 'banMembers'))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Configurações da comunidade</DialogTitle>
          <DialogDescription>Cargos dão permissões e cor ao nome. Você só mexe nos cargos abaixo do seu.</DialogDescription>
        </DialogHeader>

        <div role="tablist" className="flex gap-1 border-b border-border">
          <TabButton active={tab === 'roles'} onClick={() => setTab('roles')}>
            Cargos
          </TabButton>
          <TabButton active={tab === 'members'} onClick={() => setTab('members')}>
            Membros
          </TabButton>
          {seesBans && (
            <TabButton active={tab === 'bans'} onClick={() => setTab('bans')}>
              Banidos
            </TabButton>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!access || !me ? (
            <p className="py-6 text-sm text-muted-foreground">Carregando permissões…</p>
          ) : tab === 'roles' ? (
            <RolesTab access={access} me={me} />
          ) : tab === 'bans' ? (
            <BansTab />
          ) : (
            <MembersTab access={access} me={me} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-accent-foreground',
        active && 'border-primary text-accent-foreground'
      )}
    >
      {children}
    </button>
  )
}

// ---------- Cargos ----------

function RolesTab({ access, me }: { access: AccessState; me: string }) {
  const roles = rolesByPosition(access)
  const [selectedId, setSelectedId] = useState<string>(roles[0]?.id ?? EVERYONE_ROLE_ID)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const selected = roles.find((r) => r.id === selectedId) ?? roles[roles.length - 1]
  const canCreate = can(access, me, 'manageRoles')

  const order = reorderableRoles(access, me).map((r) => r.id)
  const dragged = useRef<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar')
    } finally {
      setBusy(false)
    }
  }

  function moveTo(roleId: string, targetIndex: number) {
    const from = order.indexOf(roleId)
    if (busy || from < 0 || targetIndex < 0 || targetIndex >= order.length || targetIndex === from) return
    const next = order.filter((id) => id !== roleId)
    next.splice(targetIndex, 0, roleId)
    void run(() => reorderRoles(next))
  }

  const moveUp = (role: Role) => moveTo(role.id, order.indexOf(role.id) + 1)
  const moveDown = (role: Role) => moveTo(role.id, order.indexOf(role.id) - 1)

  function moveWithKeys(event: KeyboardEvent, role: Role) {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    if (event.key === 'ArrowUp') moveUp(role)
    else moveDown(role)
  }

  return (
    <div className="grid gap-4 py-3 sm:grid-cols-[220px_1fr]">
      <div className="space-y-1 self-start sm:sticky sm:top-0">
        {canCreate && (
          <Button
            size="sm"
            variant="secondary"
            className="mb-2 w-full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const role = await createRole('novo cargo', null, [])
                setSelectedId(role.id)
              })
            }
          >
            <Plus />
            Criar cargo
          </Button>
        )}
        <ul aria-label="Cargos" className="space-y-0.5">
          {roles.map((role) => {
            const index = order.indexOf(role.id)
            const movable = index >= 0
            const label = roleLabel(role)
            return (
              <li
                key={role.id}
                aria-label={label}
                draggable={movable}
                onDragStart={(event) => {
                  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
                  dragged.current = role.id
                }}
                onDragOver={(event) => {
                  if (movable) event.preventDefault()
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  if (dragged.current) moveTo(dragged.current, index)
                  dragged.current = null
                }}
                onDragEnd={() => {
                  dragged.current = null
                }}
                className={cn('group flex items-center gap-1', movable && 'cursor-grab')}
              >
                {movable ? (
                  <GripVertical aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <span title="Você não pode mover este cargo" className="shrink-0">
                    <Lock role="img" aria-label={`${label}: você não pode mover este cargo`} className="size-3.5 text-muted-foreground opacity-60" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedId(role.id)}
                  onKeyDown={(event) => movable && moveWithKeys(event, role)}
                  aria-current={role.id === selected?.id}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/50',
                    role.id === selected?.id && 'bg-accent text-accent-foreground'
                  )}
                >
                  <RoleDot color={role.color} />
                  <span className="truncate">{label}</span>
                </button>
                {movable && (
                  <>
                    <button
                      type="button"
                      aria-label={`Mover ${label} para cima`}
                      title="Mover para cima (Alt + seta para cima)"
                      disabled={busy || index === order.length - 1}
                      onClick={() => moveUp(role)}
                      className="text-muted-foreground hover:text-accent-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Mover ${label} para baixo`}
                      title="Mover para baixo (Alt + seta para baixo)"
                      disabled={busy || index === 0}
                      onClick={() => moveDown(role)}
                      className="text-muted-foreground hover:text-accent-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
        {error && <p className="pt-2 text-sm text-destructive">{error}</p>}
      </div>

      {selected && (
        <RoleEditor
          key={selected.id}
          role={selected}
          access={access}
          me={me}
          onDeleted={() => setSelectedId(EVERYONE_ROLE_ID)}
        />
      )}
    </div>
  )
}

export function roleLabel(role: Role): string {
  return role.id === EVERYONE_ROLE_ID ? '@todos' : role.name
}

function RoleEditor({ role, access, me, onDeleted }: { role: Role; access: AccessState; me: string; onDeleted: () => void }) {
  const everyone = role.id === EVERYONE_ROLE_ID
  const editable = canManageRole(access, me, role)
  const [name, setName] = useState(role.name)
  const [color, setColor] = useState<string | null>(role.color)
  const [perms, setPerms] = useState<Set<Permission>>(() => new Set(role.permissions))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // o cargo mudou no servidor (salvo aqui ou por outra pessoa): recomeça do valor novo
  const version = JSON.stringify(role)
  useEffect(() => {
    setName(role.name)
    setColor(role.color)
    setPerms(new Set(role.permissions))
  }, [version])

  const dirty =
    (!everyone && (name.trim() !== role.name || color !== role.color)) ||
    perms.size !== role.permissions.length ||
    role.permissions.some((p) => !perms.has(p))

  function toggle(p: Permission, on: boolean) {
    setSaved(false)
    setPerms((prev) => {
      const next = new Set(prev)
      if (on) next.add(p)
      else next.delete(p)
      return next
    })
  }

  /** Permissão que não posso dar fica travada (mas posso tirar a que já está marcada). */
  function locked(p: Permission): boolean {
    if (!editable) return true
    if (perms.has(p) && role.permissions.includes(p)) return false
    return !canGrantPermissions(access, me, role.id, [p])
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const permissions = [...perms]
      await updateRole(role.id, everyone ? { permissions } : { name, color, permissions })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Apagar o cargo ${role.name}? Quem tem o cargo perde as permissões dele.`)) return
    setError(null)
    try {
      await deleteRole(role.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível apagar')
    }
  }

  return (
    <section aria-label={`Editar ${roleLabel(role)}`} className="space-y-4">
      {!editable && (
        <p className="flex items-center gap-2 rounded-md bg-card px-3 py-2 text-sm text-muted-foreground">
          <Shield className="size-4" />
          {role.permissions.includes('administrator') && !hasFullAccess(access, me)
            ? 'Só a dona ou um administrador mexe em cargos com Administrador.'
            : 'Este cargo está no seu nível ou acima: só dá para ver.'}
        </p>
      )}

      {everyone ? (
        <p className="text-sm text-muted-foreground">
          O <strong className="text-accent-foreground">@todos</strong> vale para todo mundo da comunidade. Permissões de administração nele só a
          dona pode dar.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="role-name" className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              Nome do cargo
            </Label>
            <Input
              id="role-name"
              value={name}
              maxLength={ROLE_NAME_MAX}
              disabled={!editable}
              onChange={(e) => {
                setName(e.target.value)
                setSaved(false)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <span className="block text-xs font-bold tracking-wide text-muted-foreground uppercase">Cor</span>
            <div className="flex h-9 items-center gap-2 pr-1 whitespace-nowrap">
              <input
                type="color"
                aria-label="Cor do cargo"
                value={color ?? DEFAULT_COLOR}
                disabled={!editable}
                onChange={(e) => {
                  setColor(e.target.value)
                  setSaved(false)
                }}
                className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent disabled:cursor-default"
              />
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={color === null}
                  disabled={!editable}
                  onChange={(e) => {
                    setColor(e.target.checked ? null : DEFAULT_COLOR)
                    setSaved(false)
                  }}
                />
                Sem cor
              </label>
            </div>
          </div>
        </div>
      )}

      <PermissionGroup title="Administração" perms={GLOBAL_PERMISSIONS} checked={perms} locked={locked} onToggle={toggle} />
      <PermissionGroup
        title="Canais (valem em todos, menos onde o canal mudar)"
        perms={CHANNEL_PERMISSIONS}
        checked={perms}
        locked={locked}
        onToggle={toggle}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {editable && (
        <div className="flex items-center justify-between gap-2">
          {!everyone ? (
            <Button type="button" variant="ghost" className="text-destructive" onClick={() => void remove()}>
              <Trash2 />
              Apagar cargo
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            {saved && !dirty && <span className="text-sm text-success">Salvo</span>}
            <Button type="button" disabled={!dirty || saving || (!everyone && !name.trim())} onClick={() => void save()}>
              {saving && <Loader2 className="animate-spin" />}
              Salvar alterações
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function PermissionGroup({
  title,
  perms,
  checked,
  locked,
  onToggle
}: {
  title: string
  perms: readonly Permission[]
  checked: Set<Permission>
  locked: (p: Permission) => boolean
  onToggle: (p: Permission, on: boolean) => void
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="pb-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">{title}</legend>
      {perms.map((p) => (
        <div key={p}>
          <label
            className={cn('flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/30', locked(p) && 'opacity-60')}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={checked.has(p)}
              disabled={locked(p)}
              aria-describedby={p === 'administrator' ? ADMIN_WARNING_ID : undefined}
              onChange={(e) => onToggle(p, e.target.checked)}
            />
            {PERMISSION_LABELS[p]}
          </label>
          {p === 'administrator' && (
            <p id={ADMIN_WARNING_ID} className="flex items-start gap-1.5 px-2 pb-1 pl-7 text-xs text-destructive">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              Quem tiver este cargo pode fazer tudo na comunidade: vê todos os canais, ignora as regras deles, modera qualquer
              pessoa e mexe em todos os cargos, inclusive nos acima do seu. Só não mexe na dona. Dê só a quem você confia.
            </p>
          )}
        </div>
      ))}
    </fieldset>
  )
}

// ---------- Membros ----------

function MembersTab({ access, me }: { access: AccessState; me: string }) {
  const allUsers = useApp(useShallow((s) => s.users))
  // uma linha por conta (a mesma conta pode estar em mais de um lugar)
  const people = [...new Map(allUsers.map((u) => [u.accountId, u])).values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR')
  )
  const roles = rolesByPosition(access).filter((r) => r.id !== EVERYONE_ROLE_ID)

  if (roles.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">Crie um cargo na aba Cargos para poder atribuí-lo.</p>
  }

  return (
    <div className="space-y-1 py-3">
      <p className="pb-2 text-sm text-muted-foreground">Quem está online. Os cargos de quem está offline continuam valendo.</p>
      {people.map((user) => (
        <MemberRow key={user.accountId} user={user} access={access} me={me} roles={roles} />
      ))}
    </div>
  )
}

function MemberRow({ user, access, me, roles }: { user: User; access: AccessState; me: string; roles: Role[] }) {
  const current = memberRoleIds(access, user.accountId)
  const editable = canChangeMemberRoles(access, me, user.accountId)
  const isOwner = user.accountId === access.ownerAccountId
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => setError(null), [current.join(',')])

  async function toggle(roleId: string, on: boolean) {
    const next = on ? [...current, roleId] : current.filter((id) => id !== roleId)
    setBusy(true)
    setError(null)
    try {
      await setMemberRoles(user.accountId, next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md px-2 py-2 hover:bg-accent/20" aria-label={`Cargos de ${user.name}`} role="group">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="truncate text-accent-foreground">
          {user.name}
          <span className="font-normal text-muted-foreground">#{user.tag}</span>
        </span>
        {isOwner && <span className="rounded bg-primary/20 px-1.5 text-xs text-primary">dona</span>}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {roles.map((role) => (
          <label key={role.id} className="flex items-center gap-1.5 text-sm text-sidebar-foreground">
            <input
              type="checkbox"
              checked={current.includes(role.id)}
              disabled={busy || !editable || !canAssignRole(access, me, role)}
              onChange={(e) => void toggle(role.id, e.target.checked)}
            />
            <RoleDot color={role.color} />
            {role.name}
          </label>
        ))}
      </div>
      {error && <p className="pt-1 text-sm text-destructive">{error}</p>}
    </div>
  )
}
