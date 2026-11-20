import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Dices, Loader2, Server } from 'lucide-react'
import { PASSWORD_MIN, TAG_MAX, TAG_PATTERN } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cancelRestore, getAuthConfig, login, loginWithGoogle, register, savedServerUrl, updateProfile } from '@/lib/client'
import { randomTag } from '@/lib/image'
import { useApp } from '@/store'
import { AvatarPicker } from './AvatarPicker'
import { ConcordLogo } from './ConcordLogo'
import { GoogleIcon } from './GoogleIcon'

type Mode = 'login' | 'register'

const errorText = (err: unknown): string => (err instanceof Error ? err.message : 'Algo deu errado')

export function LoginScreen() {
  const restoring = useApp((s) => s.restoring)
  const [mode, setMode] = useState<Mode>('login')
  const [server, setServer] = useState(savedServerUrl)
  const [editingServer, setEditingServer] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'form' | 'google' | null>(null)

  // campos
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [name, setName] = useState('')
  const [tag, setTag] = useState(randomTag)
  const [avatar, setAvatar] = useState<string | null>(null)

  useEffect(() => {
    if (editingServer) return
    let cancelled = false
    setGoogleEnabled(null)
    getAuthConfig(server)
      .then((cfg) => !cancelled && setGoogleEnabled(!!cfg.googleClientId))
      .catch(() => !cancelled && setGoogleEnabled(false))
    return () => {
      cancelled = true
    }
  }, [server, editingServer])

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setPassword('')
    setConfirm('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (mode === 'register') {
      if (name.trim().length < 2) return setError('O nome precisa ter pelo menos 2 caracteres')
      if (!TAG_PATTERN.test(tag)) return setError(`O id precisa ter de 1 a ${TAG_MAX} letras ou números`)
      if (password.length < PASSWORD_MIN) return setError(`A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres`)
      if (password !== confirm) return setError('As senhas não conferem')
    }
    setBusy('form')
    try {
      if (mode === 'login') {
        await login(server, { email, password })
      } else {
        await register(server, { email, password, name, tag })
        if (avatar) {
          // A conta já existe; se a foto falhar, dá para trocar depois no perfil.
          await updateProfile({ name, avatar }).catch(() => {})
        }
      }
    } catch (err) {
      setError(errorText(err))
      setBusy(null)
    }
  }

  async function google() {
    setError(null)
    setBusy('google')
    try {
      await loginWithGoogle(server)
    } catch (err) {
      setError(errorText(err))
      setBusy(null)
    }
  }

  if (restoring) {
    return (
      <Backdrop>
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
          Entrando...
          <Button type="button" variant="link" onClick={cancelRestore}>
            Entrar com outra conta
          </Button>
        </div>
      </Backdrop>
    )
  }

  const isRegister = mode === 'register'

  return (
    <Backdrop>
      <form onSubmit={submit} data-glass="surface" className="w-full max-w-[460px] rounded-lg bg-background p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <ConcordLogo className="mx-auto mb-4 size-14 text-primary" />
          <h1 className="text-2xl font-semibold text-accent-foreground">
            {isRegister ? 'Criar uma conta' : 'Boas-vindas de volta!'}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {isRegister ? 'Escolha seu nome e seu id.' : 'Que bom te ver de novo!'}
          </p>
        </div>

        <div className="space-y-4">
          {isRegister && (
            <AvatarPicker name={name} color="var(--color-primary)" value={avatar} onChange={setAvatar} />
          )}

          <Field id="email" label="E-mail">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          {isRegister && (
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Field id="name" label="Nome de exibição">
                <Input id="name" required maxLength={32} value={name} onChange={(e) => setName(e.target.value.replace(/#/g, ''))} />
              </Field>
              <Field id="tag" label="Id">
                <div className="flex items-center gap-1">
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">#</span>
                    <Input
                      id="tag"
                      required
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
              </Field>
            </div>
          )}

          {isRegister && name.trim() && tag && (
            <p className="-mt-2 text-sm text-muted-foreground">
              Você vai aparecer como{' '}
              <span className="font-semibold text-accent-foreground">
                {name.trim()}#{tag}
              </span>
              <span className="mt-1 block">Escolha bem: o id não pode ser alterado depois (o nome pode).</span>
            </p>
          )}

          <Field id="password" label="Senha">
            <Input
              id="password"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {isRegister && (
            <Field id="confirm" label="Confirmar senha">
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={!!busy}>
            {busy === 'form' && <Loader2 className="animate-spin" />}
            {isRegister ? 'Criar conta' : 'Entrar'}
          </Button>

          <div className="flex items-center gap-3 text-xs text-muted-foreground uppercase">
            <div className="h-px flex-1 bg-border" />
            ou
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            disabled={!!busy || !googleEnabled}
            onClick={() => void google()}
            title={googleEnabled === false ? 'Login com Google não está configurado neste servidor' : undefined}
          >
            {busy === 'google' ? <Loader2 className="animate-spin" /> : <GoogleIcon />}
            {busy === 'google' ? 'Continue no navegador...' : 'Entrar com Google'}
          </Button>

          <p className="text-sm text-muted-foreground">
            {isRegister ? 'Já tem uma conta? ' : 'Precisa de uma conta? '}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => switchMode(isRegister ? 'login' : 'register')}
            >
              {isRegister ? 'Entrar' : 'Cadastre-se'}
            </button>
          </p>

          <div className="border-t border-border pt-3">
            {editingServer ? (
              <div className="flex gap-2">
                <Input autoFocus value={server} onChange={(e) => setServer(e.target.value)} aria-label="Endereço do servidor" />
                <Button type="button" variant="secondary" onClick={() => setEditingServer(false)} disabled={!server.trim()}>
                  OK
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingServer(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent-foreground"
              >
                <Server className="size-3.5" />
                Servidor: <span className="truncate">{server}</span>
                <span className="ml-1 underline">alterar</span>
              </button>
            )}
          </div>
        </div>
      </form>
    </Backdrop>
  )
}

function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-rail bg-[radial-gradient(ellipse_at_top,#5865f233,transparent_60%)] p-4">
      {children}
    </div>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
        {label} <span className="text-destructive">*</span>
      </Label>
      {children}
    </div>
  )
}
