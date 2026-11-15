/**
 * Tela "Amigos" da Home (B7/A6): abas Online, Todos, Pendentes, Bloqueados e "Adicionar amigo".
 * As listas vêm de `friendGroups` (lib/friends.ts); as ações mandam `friend:*` e o estado novo
 * chega por `friend:updated`/`friend:removed`.
 */
import { useState, type FormEvent, type ReactNode } from 'react'
import { Ban, Check, MessageCircle, UserMinus, UserPlus, Users, X } from 'lucide-react'
import type { FriendEntry } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  acceptFriend,
  blockAccount,
  declineFriend,
  messageAccount,
  notify,
  removeFriend,
  sendFriendRequest,
  unblockAccount
} from '@/lib/client'
import { friendGroups, type FriendGroups } from '@/lib/friends'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { UserAvatar } from '../UserAvatar'

type Tab = keyof FriendGroups | 'add'

const TABS: { id: keyof FriendGroups; label: string; empty: string }[] = [
  { id: 'online', label: 'Online', empty: 'Nenhum amigo online agora.' },
  { id: 'all', label: 'Todos', empty: 'Você ainda não tem amigos. Adicione alguém pelo nome#id.' },
  { id: 'pending', label: 'Pendentes', empty: 'Nenhum pedido de amizade.' },
  { id: 'blocked', label: 'Bloqueados', empty: 'Você não bloqueou ninguém.' }
]

function fail(err: unknown, fallback: string): void {
  notify(err instanceof Error ? err.message : fallback)
}

export function FriendsView() {
  const [tab, setTab] = useState<Tab>('online')
  const friends = useApp((s) => s.friends)
  const loaded = useApp((s) => s.friendsLoaded)
  const groups = friendGroups(friends)
  const incoming = groups.pending.filter((e) => e.status === 'incoming').length
  const current = TABS.find((t) => t.id === tab)

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-black/25 px-4 shadow-sm">
        <div className="flex items-center gap-2 font-semibold text-accent-foreground">
          <Users className="size-5 text-muted-foreground" />
          Amigos
        </div>
        <div className="h-6 w-px bg-border" />
        <div role="tablist" aria-label="Amigos" className="flex items-center gap-1">
          {TABS.map((t) => (
            <TabButton key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'pending' && incoming > 0 && (
                <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">{incoming}</span>
              )}
            </TabButton>
          ))}
          <button
            role="tab"
            aria-selected={tab === 'add'}
            onClick={() => setTab('add')}
            className={cn(
              'rounded px-2 py-0.5 text-sm font-medium',
              tab === 'add' ? 'bg-transparent text-success' : 'bg-success text-white hover:opacity-90'
            )}
          >
            Adicionar amigo
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {tab === 'add' ? (
          <AddFriend />
        ) : !loaded ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <FriendList title={`${current?.label ?? ''} — ${groups[tab].length}`} entries={groups[tab]} empty={current?.empty ?? ''} />
        )}
      </div>
    </>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex items-center rounded px-2 py-0.5 text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        active && 'bg-accent text-accent-foreground'
      )}
    >
      {children}
    </button>
  )
}

function FriendList({ title, entries, empty }: { title: string; entries: FriendEntry[]; empty: string }) {
  if (entries.length === 0) return <p className="mt-8 text-center text-muted-foreground">{empty}</p>
  return (
    <>
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <ul className="divide-y divide-border">
        {entries.map((e) => (
          <FriendRow key={e.account.id} entry={e} />
        ))}
      </ul>
    </>
  )
}

const STATUS_TEXT: Record<FriendEntry['status'], string> = {
  friend: '',
  incoming: 'Pedido de amizade recebido',
  outgoing: 'Pedido de amizade enviado',
  blocked: 'Bloqueado'
}

function FriendRow({ entry }: { entry: FriendEntry }) {
  const { account, status, online } = entry
  const subtitle = status === 'friend' ? (online ? 'Online' : 'Offline') : STATUS_TEXT[status]

  return (
    <li className="group flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-accent/40">
      <span className="relative shrink-0">
        <UserAvatar user={account} />
        {status === 'friend' && (
          <span
            className={cn(
              'absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full border-[3px] border-background',
              online ? 'bg-success' : 'bg-muted-foreground'
            )}
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-accent-foreground">
          {account.name}
          <span className="font-normal text-muted-foreground">#{account.tag}</span>
        </div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <div className="flex gap-2">
        {status === 'friend' && (
          <>
            <RowAction
              label="Mensagem"
              onClick={() => messageAccount(account.id).catch((e: unknown) => fail(e, 'Não foi possível abrir a conversa'))}
            >
              <MessageCircle />
            </RowAction>
            <RowAction
              label="Desfazer amizade"
              danger
              onClick={() => {
                if (!window.confirm(`Desfazer a amizade com ${account.name}?`)) return
                removeFriend(account.id).catch((e: unknown) => fail(e, 'Não foi possível desfazer a amizade'))
              }}
            >
              <UserMinus />
            </RowAction>
          </>
        )}
        {status === 'incoming' && (
          <>
            <RowAction label="Aceitar" onClick={() => acceptFriend(account.id).catch((e: unknown) => fail(e, 'Não foi possível aceitar'))}>
              <Check className="text-success" />
            </RowAction>
            <RowAction
              label="Recusar"
              danger
              onClick={() => declineFriend(account.id).catch((e: unknown) => fail(e, 'Não foi possível recusar'))}
            >
              <X />
            </RowAction>
          </>
        )}
        {status === 'outgoing' && (
          <RowAction
            label="Cancelar pedido"
            danger
            onClick={() => declineFriend(account.id).catch((e: unknown) => fail(e, 'Não foi possível cancelar'))}
          >
            <X />
          </RowAction>
        )}
        {status === 'blocked' ? (
          <RowAction
            label="Desbloquear"
            onClick={() => unblockAccount(account.id).catch((e: unknown) => fail(e, 'Não foi possível desbloquear'))}
          >
            <Ban className="text-destructive" />
          </RowAction>
        ) : (
          <RowAction
            label="Bloquear"
            danger
            onClick={() => {
              if (!window.confirm(`Bloquear ${account.name}? A conversa entre vocês é fechada.`)) return
              blockAccount(account.id).catch((e: unknown) => fail(e, 'Não foi possível bloquear'))
            }}
          >
            <Ban />
          </RowAction>
        )}
      </div>
    </li>
  )
}

function RowAction({
  label,
  danger = false,
  onClick,
  children
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          onClick={onClick}
          className={cn(
            'flex size-9 items-center justify-center rounded-full bg-sidebar text-muted-foreground [&_svg]:size-4.5',
            danger ? 'hover:text-destructive' : 'hover:text-accent-foreground'
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function AddFriend() {
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!target.trim() || busy) return
    setBusy(true)
    try {
      const entry = await sendFriendRequest(target)
      const who = entry ? `${entry.account.name}#${entry.account.tag}` : target.trim()
      setResult({
        ok: true,
        text: entry?.status === 'friend' ? `Agora você e ${who} são amigos!` : `Pedido de amizade enviado para ${who}.`
      })
      setTarget('')
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível enviar o pedido' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="max-w-2xl">
      <h2 className="font-semibold text-accent-foreground uppercase">Adicionar amigo</h2>
      <p className="mt-1 text-sm text-muted-foreground">Você pode adicionar alguém pelo nome e id, no formato nome#id.</p>
      <form onSubmit={(e) => void submit(e)} className="mt-4 flex gap-2">
        <Input
          value={target}
          onChange={(e) => {
            setTarget(e.target.value)
            setResult(null)
          }}
          placeholder="nome#id"
          aria-label="Nome e id da pessoa"
          maxLength={80}
          autoFocus
        />
        <Button type="submit" disabled={!target.trim() || busy}>
          <UserPlus />
          Enviar pedido
        </Button>
      </form>
      {result && (
        <p role="status" className={cn('mt-2 text-sm', result.ok ? 'text-success' : 'text-destructive')}>
          {result.text}
        </p>
      )}
    </section>
  )
}
