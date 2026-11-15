// Cartão do sorteio de times no chat (B10): times com cor e lanes, e "Mover para as salas"
// (escolher uma sala de voz por time; `tools:move-teams`, skill `concord-tools`).
import { useState } from 'react'
import { ArrowRightLeft, Loader2, Shuffle } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { LANE_LABELS, MOVE_TEAMS_SKIP_LABELS, type Message, type MoveTeamsSkip, type TeamsResult } from '@shared/types'
import { Button } from '@/components/ui/button'
import { moveTeams } from '@/lib/client'
import { allows } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { useApp } from '@/store'
import { selectClass } from './shared'
import { CardFrame } from './CardFrame'

/** Cor de cada time (tokens do tema; repete depois do 4º). */
const TEAM_COLORS = ['bg-primary', 'bg-success', 'bg-destructive', 'bg-accent-foreground']
export const teamColor = (i: number): string => TEAM_COLORS[i % TEAM_COLORS.length]

export function TeamResultCard({ message, result }: { message: Message; result: TeamsResult }) {
  const [moving, setMoving] = useState(false)
  return (
    <CardFrame icon={<Shuffle className="size-4" />} title="Times sorteados" label="Times sorteados">
      <div className="grid gap-2 sm:grid-cols-2">
        {result.teams.map((team, i) => (
          <div key={i} className="rounded-md bg-background/40 p-2">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-accent-foreground">
              <span className={cn('size-2.5 rounded-full', teamColor(i))} />
              Time {i + 1}
            </div>
            <ul className="text-sm">
              {team.members.map((m) => (
                <li key={m.name} className="flex justify-between gap-2">
                  <span className="truncate">{m.name}</span>
                  {m.lane && <span className="text-xs text-muted-foreground">{LANE_LABELS[m.lane]}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {moving ? (
        <MoveTeamsForm message={message} result={result} onClose={() => setMoving(false)} />
      ) : (
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => setMoving(true)}>
          <ArrowRightLeft className="size-4" />
          Mover para as salas
        </Button>
      )}
    </CardFrame>
  )
}

function MoveTeamsForm({ message, result, onClose }: { message: Message; result: TeamsResult; onClose: () => void }) {
  // salas de voz da comunidade que eu vejo (o servidor confere se cada pessoa pode entrar)
  // (filter devolve os mesmos objetos da store, então useShallow basta)
  const rooms = useApp(
    useShallow((s) => s.channels.filter((c) => c.type === 'voice' && allows(s.access, s.self?.accountId, 'view', c.id)))
  )
  const [choice, setChoice] = useState<string[]>(() => result.teams.map(() => ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ moved: number; skipped: MoveTeamsSkip[] } | null>(null)

  const chosen = choice.filter(Boolean)
  const repeated = new Set(chosen).size !== chosen.length

  async function submit(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setDone(await moveTeams(message.id, choice.map((id) => id || null)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível mover os times')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="mt-2 text-sm" role="status">
        <p>
          {done.moved === 0 ? 'Ninguém precisou trocar de sala.' : `${done.moved} ${done.moved === 1 ? 'pessoa levada' : 'pessoas levadas'} para a sala do time.`}
        </p>
        {done.skipped.length > 0 && (
          <ul className="mt-1 text-xs text-muted-foreground">
            {done.skipped.map((s) => (
              <li key={s.name}>
                {s.name}: {MOVE_TEAMS_SKIP_LABELS[s.reason]}
              </li>
            ))}
          </ul>
        )}
        <Button variant="link" size="sm" className="h-auto p-0" onClick={onClose}>
          Fechar
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {rooms.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma sala de voz disponível.</p>
      ) : (
        result.teams.map((_, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <span className={cn('size-2.5 shrink-0 rounded-full', teamColor(i))} />
            <span className="w-16 shrink-0">Time {i + 1}</span>
            <select
              aria-label={`Sala do time ${i + 1}`}
              value={choice[i]}
              onChange={(e) => setChoice((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
              className={cn(selectClass, 'h-8')}
            >
              <option value="">Não mover</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        ))
      )}
      {repeated && <p className="text-xs text-destructive">Escolha uma sala diferente para cada time.</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || chosen.length === 0 || repeated} onClick={() => void submit()}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Mover
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Só quem já está numa sala de voz é levado. Mover outras pessoas exige gerenciar membros.
      </p>
    </div>
  )
}
