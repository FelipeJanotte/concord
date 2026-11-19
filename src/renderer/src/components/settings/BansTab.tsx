import { useEffect, useState } from 'react'
import type { CommunityBan } from '@shared/types'
import { Button } from '@/components/ui/button'
import { loadBans, unbanFromCommunity } from '@/lib/client'

const errorText = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback)

export function BansTab() {
  const [bans, setBans] = useState<CommunityBan[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    loadBans().then(
      (list) => active && setBans(list),
      (err: unknown) => active && setError(errorText(err, 'Não foi possível carregar os banimentos'))
    )
    return () => {
      active = false
    }
  }, [])

  async function unban(accountId: string) {
    setError(null)
    try {
      await unbanFromCommunity(accountId)
      setBans((list) => list?.filter((b) => b.accountId !== accountId) ?? null)
    } catch (err) {
      setError(errorText(err, 'Não foi possível tirar o banimento'))
    }
  }

  return (
    <div className="space-y-1 py-3">
      {error && <p className="pb-2 text-sm text-destructive">{error}</p>}
      {bans === null && !error && <p className="text-sm text-muted-foreground">Carregando banimentos…</p>}
      {bans?.length === 0 && <p className="text-sm text-muted-foreground">Ninguém está banido.</p>}
      {bans?.map((ban) => (
        <div
          key={ban.accountId}
          role="group"
          aria-label={`Banimento de ${ban.name}`}
          className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent/20"
        >
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium text-accent-foreground">
              {ban.name}
              <span className="font-normal text-muted-foreground">#{ban.tag}</span>
            </p>
            <p className="truncate text-muted-foreground">{ban.reason ?? 'Sem motivo'}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void unban(ban.accountId)}>
            Tirar banimento
          </Button>
        </div>
      ))}
    </div>
  )
}
