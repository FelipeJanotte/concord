import { useEffect, useState, type FormEvent } from 'react'
import { Dices, Loader2, Lock, LogOut } from 'lucide-react'
import { TAG_MAX, type ProfileUpdate } from '@shared/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { logout, notify, updateProfile } from '@/lib/client'
import { randomTag } from '@/lib/image'
import { useApp } from '@/store'
import { AvatarPicker } from './AvatarPicker'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ProfileDialog({ open, onOpenChange }: Props) {
  const account = useApp((s) => s.account)
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  /** caminho atual no servidor ou novo data URL */
  const [avatar, setAvatar] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !account) return
    setName(account.name)
    setTag(account.tag)
    setAvatar(account.avatarUrl)
    setError(null)
    setLoading(false)
  }, [open, account])

  if (!account) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const update: ProfileUpdate = { name }
    if (!account!.tagLocked) update.tag = tag // escolha única do id (contas do Google)
    if (avatar !== account!.avatarUrl) update.avatar = avatar // data URL nova ou null (remover)
    try {
      await updateProfile(update)
      onOpenChange(false)
      notify('Perfil atualizado', 'info')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
      setLoading(false)
    }
  }

  const loginMethods = [account.hasPassword && 'e-mail e senha', account.hasGoogle && 'Google'].filter(Boolean).join(' e ')
  const choosingTag = !account.tagLocked

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{choosingTag ? 'Escolha seu id' : 'Minha conta'}</DialogTitle>
            <DialogDescription>
              {account.email} · entra com {loginMethods}
            </DialogDescription>
          </DialogHeader>

          <AvatarPicker name={name} color={account.color} value={avatar} onChange={setAvatar} />

          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-2">
              <Label htmlFor="profile-name" className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                Nome de exibição
              </Label>
              <Input
                id="profile-name"
                maxLength={32}
                value={name}
                onChange={(e) => setName(e.target.value.replace(/#/g, ''))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-tag" className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                Id
              </Label>
              {choosingTag ? (
                <div className="flex items-center gap-1">
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">#</span>
                    <Input
                      id="profile-tag"
                      maxLength={TAG_MAX}
                      className="w-24 pl-6"
                      value={tag}
                      onChange={(e) => setTag(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label="Sortear id" onClick={() => setTag(randomTag())}>
                    <Dices />
                  </Button>
                </div>
              ) : (
                <div
                  id="profile-tag"
                  className="flex h-9 w-24 items-center gap-1.5 rounded-md bg-card px-3 text-muted-foreground"
                  title="O id não pode ser alterado"
                >
                  <Lock className="size-3.5 shrink-0" />#{account.tag}
                </div>
              )}
            </div>
          </div>

          <p className="-mt-2 text-sm text-muted-foreground">
            Você aparece como{' '}
            <span className="font-semibold text-accent-foreground">
              {name.trim() || '...'}#{tag || '...'}
            </span>
            {choosingTag ? (
              <span className="mt-1 block text-destructive">
                Atenção: depois de salvar, o id não poderá ser alterado. O nome você pode trocar quando quiser.
              </span>
            ) : (
              <span className="mt-1 block">O id é fixo e diferencia você de outras pessoas com o mesmo nome.</span>
            )}
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={logout}>
              <LogOut />
              Sair da conta
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="link" className="text-accent-foreground" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading || name.trim().length < 2 || !tag}>
                {loading && <Loader2 className="animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
