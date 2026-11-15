/**
 * Aba "Permissões" do canal (B5): por cargo, cada permissão do canal fica em
 * Negar / Herdar (do cargo) / Liberar. "Canal privado" é o atalho para negar `view` ao @todos.
 * Salvar substitui todas as regras do canal (`channel:set-overrides`, exige manageChannels).
 */
import { useEffect, useState } from 'react'
import { Check, Loader2, Lock, Minus, X } from 'lucide-react'
import {
  EVERYONE_ROLE_ID,
  PERMISSION_LABELS,
  type Channel,
  type ChannelOverride,
  type ChannelPermission,
  type Role
} from '@shared/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { setChannelOverrides } from '@/lib/client'
import { rolesByPosition } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { roleLabel } from './CommunitySettingsDialog'
import { RoleDot } from './RoleDot'

/** Permissões que fazem sentido em cada tipo de canal. */
export const PERMISSIONS_BY_TYPE: Record<Channel['type'], ChannelPermission[]> = {
  text: ['view', 'send', 'attach'],
  voice: ['view', 'connect', 'speak', 'share', 'video'],
  // conversa privada não tem regras por cargo (só os dois membros veem; skill concord-dms)
  dm: []
}

type Rule = { allow: ChannelPermission[]; deny: ChannelPermission[] }
type Draft = Record<string, Rule>
export type RuleState = 'deny' | 'inherit' | 'allow'

function draftFrom(overrides: ChannelOverride[], channelId: string): Draft {
  const draft: Draft = {}
  for (const o of overrides) if (o.channelId === channelId) draft[o.roleId] = { allow: [...o.allow], deny: [...o.deny] }
  return draft
}

export function stateOf(rule: Rule | undefined, p: ChannelPermission): RuleState {
  if (rule?.allow.includes(p)) return 'allow'
  if (rule?.deny.includes(p)) return 'deny'
  return 'inherit'
}

export function withState(rule: Rule | undefined, p: ChannelPermission, state: RuleState): Rule {
  const allow = (rule?.allow ?? []).filter((x) => x !== p)
  const deny = (rule?.deny ?? []).filter((x) => x !== p)
  if (state === 'allow') allow.push(p)
  if (state === 'deny') deny.push(p)
  return { allow, deny }
}

export function ChannelPermissionsDialog({
  channel,
  open,
  onOpenChange
}: {
  channel: Channel
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const access = useApp((s) => s.access)
  const roles = rolesByPosition(access).reverse() // @todos primeiro, como no Discord
  const [draft, setDraft] = useState<Draft>({})
  const [roleId, setRoleId] = useState(EVERYONE_ROLE_ID)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraft(draftFrom(access?.overrides ?? [], channel.id))
    setRoleId(EVERYONE_ROLE_ID)
    setError(null)
    setSaving(false)
    // só ao abrir: mudanças de outra pessoa com o diálogo aberto não apagam o que está sendo editado
  }, [open, channel.id])

  const perms = PERMISSIONS_BY_TYPE[channel.type]
  const role = roles.find((r) => r.id === roleId) ?? roles[0]
  const isPrivate = stateOf(draft[EVERYONE_ROLE_ID], 'view') === 'deny'
  const label = channel.type === 'text' ? `#${channel.name}` : channel.name

  function set(id: string, p: ChannelPermission, state: RuleState) {
    setDraft((d) => ({ ...d, [id]: withState(d[id], p, state) }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await setChannelOverrides(
        channel.id,
        Object.entries(draft).map(([id, rule]) => ({ roleId: id, ...rule }))
      )
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar')
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Permissões de {label}</DialogTitle>
          <DialogDescription>
            O que cada cargo pode neste canal. "Herdar" usa o que o cargo já tem; entre cargos, liberar vence negar.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-start gap-3 rounded-md bg-card px-3 py-2.5">
          <input
            type="checkbox"
            className="mt-1"
            checked={isPrivate}
            onChange={(e) => set(EVERYONE_ROLE_ID, 'view', e.target.checked ? 'deny' : 'inherit')}
          />
          <span>
            <span className="flex items-center gap-1.5 font-medium text-accent-foreground">
              <Lock className="size-4" />
              Canal privado
            </span>
            <span className="block text-sm text-muted-foreground">
              Só quem tem um cargo com "Ver o canal" liberado aqui (e quem gerencia canais) vai ver.
            </span>
          </span>
        </label>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto sm:grid-cols-[180px_1fr]">
          <ul aria-label="Cargos" className="space-y-0.5">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  aria-current={r.id === role?.id}
                  onClick={() => setRoleId(r.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/50',
                    r.id === role?.id && 'bg-accent text-accent-foreground'
                  )}
                >
                  <RoleDot color={r.color} />
                  <span className="flex-1 truncate">{roleLabel(r)}</span>
                  {(draft[r.id]?.allow.length ?? 0) + (draft[r.id]?.deny.length ?? 0) > 0 && (
                    <span className="size-1.5 rounded-full bg-primary" aria-label="tem regras" />
                  )}
                </button>
              </li>
            ))}
          </ul>

          {role && <RuleEditor role={role} perms={perms} rule={draft[role.id]} onChange={(p, st) => set(role.id, p, st)} />}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="link" className="text-accent-foreground" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const OPTIONS: { state: RuleState; label: string; Icon: typeof Check; active: string }[] = [
  { state: 'deny', label: 'Negar', Icon: X, active: 'bg-destructive text-white' },
  { state: 'inherit', label: 'Herdar', Icon: Minus, active: 'bg-secondary text-secondary-foreground' },
  { state: 'allow', label: 'Liberar', Icon: Check, active: 'bg-success text-white' }
]

function RuleEditor({
  role,
  perms,
  rule,
  onChange
}: {
  role: Role
  perms: ChannelPermission[]
  rule: Rule | undefined
  onChange: (p: ChannelPermission, state: RuleState) => void
}) {
  return (
    <div className="space-y-1" aria-label={`Regras de ${roleLabel(role)}`} role="group">
      {perms.map((p) => {
        const current = stateOf(rule, p)
        return (
          <div key={p} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent/20">
            <span className="text-sm">{PERMISSION_LABELS[p]}</span>
            <div role="radiogroup" aria-label={PERMISSION_LABELS[p]} className="flex overflow-hidden rounded-md border border-border">
              {OPTIONS.map(({ state, label, Icon, active }) => (
                <button
                  key={state}
                  type="button"
                  role="radio"
                  aria-checked={current === state}
                  aria-label={label}
                  title={label}
                  onClick={() => onChange(p, state)}
                  className={cn('px-2 py-1 text-muted-foreground hover:bg-accent/50', current === state && active)}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
