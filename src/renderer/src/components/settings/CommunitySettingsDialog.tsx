/**
 * "Configurações da comunidade" (B5): criar, editar, ordenar e apagar cargos (aba Cargos) e
 * dar/tirar cargos das pessoas (aba Membros). Mostra só o que a pessoa pode mexer;
 * o servidor confere tudo de novo (hierarquia, `canGrantPermissions`).
 */
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Plus, Shield, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import {
  can,
  canGrantPermissions,
  CHANNEL_PERMISSIONS,
  EVERYONE_ROLE_ID,
  GLOBAL_PERMISSIONS,
  PERMISSION_LABELS,
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
import { canAssignRole, canEditMember, canManageRole, memberRoleIds, rolesByPosition } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { RoleDot } from './RoleDot'

export const ROLE_NAME_MAX = 32
const DEFAULT_COLOR = '#5865f2'

type Tab = 'roles' | 'members'

export function CommunitySettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const access = useApp((s) => s.access)
  const me = useApp((s) => s.self?.accountId)
  const [tab, setTab] = useState<Tab>('roles')

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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!access || !me ? (
            <p className="py-6 text-sm text-muted-foreground">Carregando permissões…</p>
          ) : tab === 'roles' ? (
            <RolesTab access={access} me={me} />
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

  // Ordem que o servidor espera: só os cargos que posso mexer, do menos para o mais importante.
  const manageable = roles.filter((r) => r.id !== EVERYONE_ROLE_ID && canManageRole(access, me, r))

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

  function move(role: Role, direction: 1 | -1) {
    const order = [...manageable].reverse() // menos → mais importante
    const i = order.findIndex((r) => r.id === role.id)
    const j = i + direction
    if (i < 0 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    void run(() => reorderRoles(order.map((r) => r.id)))
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
            const index = manageable.findIndex((r) => r.id === role.id)
            return (
              <li key={role.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedId(role.id)}
                  aria-current={role.id === selected?.id}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/50',
                    role.id === selected?.id && 'bg-accent text-accent-foreground'
                  )}
                >
                  <RoleDot color={role.color} />
                  <span className="truncate">{roleLabel(role)}</span>
                </button>
                {index >= 0 && (
                  <>
                    <button
                      type="button"
                      aria-label={`Subir ${role.name}`}
                      disabled={busy || index === 0}
                      onClick={() => move(role, 1)}
                      className="text-muted-foreground hover:text-accent-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Descer ${role.name}`}
                      disabled={busy || index === manageable.length - 1}
                      onClick={() => move(role, -1)}
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
          Este cargo está no seu nível ou acima: só dá para ver.
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
        <label
          key={p}
          className={cn('flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/30', locked(p) && 'opacity-60')}
        >
          <input
            type="checkbox"
            className="mt-0.5"
            checked={checked.has(p)}
            disabled={locked(p)}
            onChange={(e) => onToggle(p, e.target.checked)}
          />
          {PERMISSION_LABELS[p]}
        </label>
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
  const editable = canEditMember(access, me, user.accountId)
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
