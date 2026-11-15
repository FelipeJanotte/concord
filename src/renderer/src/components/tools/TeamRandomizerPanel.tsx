// Painel do sorteador de times (B10): pessoas (digitadas ou importadas da sala de voz / online),
// número de times, lanes com preferência por pessoa e o canal. "Sortear de novo" repete o pedido.
import { useState, type FormEvent } from 'react'
import { UserPlus, X } from 'lucide-react'
import {
  LANE_LABELS,
  LANES,
  TEAM_LANES_MAX_SIZE,
  TEAM_PLAYER_NAME_MAX,
  TEAMS_MAX,
  TEAMS_MAX_PLAYERS,
  TEAMS_MIN,
  TEAMS_MIN_PLAYERS,
  type Lane,
  type TeamPlayer
} from '@shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { drawTeams } from '@/lib/client'
import { PostedResult } from './PostedResult'
import { ImportPeopleButtons, type Person } from './people'
import { ChannelSelect, Field, selectClass, SubmitButton, ToolError, ToolPanel, usePost, usePostTarget } from './shared'

const key = (name: string): string => name.replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR')

/** Junta pessoas novas à lista sem repetir (mesma conta ou mesmo nome). */
export function mergePlayers(current: TeamPlayer[], extra: Array<TeamPlayer | Person>): TeamPlayer[] {
  const out = [...current]
  for (const p of extra) {
    const name = p.name.replace(/\s+/g, ' ').trim()
    if (!name) continue
    if (out.some((q) => (p.accountId && q.accountId === p.accountId) || key(q.name) === key(name))) continue
    out.push({ name, ...(p.accountId ? { accountId: p.accountId } : {}) })
  }
  return out
}

export function TeamRandomizerPanel() {
  const { targets, channelId, setChannelId } = usePostTarget()
  const [players, setPlayers] = useState<TeamPlayer[]>([])
  const [draft, setDraft] = useState('')
  const [teamCount, setTeamCount] = useState(2)
  const [lanes, setLanes] = useState(false)
  const { busy, error, posted, post } = usePost()

  function addDraft(e: FormEvent): void {
    e.preventDefault()
    setPlayers((prev) => mergePlayers(prev, draft.split(/[,\n]/).map((name) => ({ name }))))
    setDraft('')
  }

  const setLane = (i: number, lane: Lane | ''): void =>
    setPlayers((prev) => prev.map((p, j) => (j === i ? { ...p, lanes: lane ? [lane] : [] } : p)))

  const tooManyForLanes = lanes && players.length > teamCount * TEAM_LANES_MAX_SIZE
  const ready = !!channelId && players.length >= TEAMS_MIN_PLAYERS && teamCount <= players.length && !tooManyForLanes

  return (
    <ToolPanel description="Sorteia times equilibrados no servidor e posta no canal. Depois dá para levar cada time para uma sala de voz.">
      <Field label={`Pessoas (${players.length}/${TEAMS_MAX_PLAYERS})`} htmlFor="team-add">
        <form onSubmit={addDraft} className="flex gap-2">
          <Input
            id="team-add"
            value={draft}
            maxLength={TEAM_PLAYER_NAME_MAX * 4}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nome (ou vários separados por vírgula)"
          />
          <Button type="submit" variant="secondary" disabled={!draft.trim()}>
            <UserPlus className="size-4" />
            Adicionar
          </Button>
        </form>
      </Field>
      <ImportPeopleButtons onImport={(people) => setPlayers((prev) => mergePlayers(prev, people))} />

      {players.length > 0 && (
        <ul aria-label="Pessoas do sorteio" className="flex flex-col gap-1">
          {players.map((p, i) => (
            <li key={p.accountId ?? p.name} className="flex items-center gap-2 rounded-md bg-panel px-3 py-1.5 text-sm">
              <span className="flex-1 truncate">{p.name}</span>
              {lanes && (
                <select
                  aria-label={`Lane preferida de ${p.name}`}
                  value={p.lanes?.[0] ?? ''}
                  onChange={(e) => setLane(i, e.target.value as Lane | '')}
                  className={`${selectClass} h-8 w-32`}
                >
                  <option value="">Qualquer lane</option>
                  {LANES.map((l) => (
                    <option key={l} value={l}>
                      {LANE_LABELS[l]}
                    </option>
                  ))}
                </select>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Tirar ${p.name}`}
                onClick={() => setPlayers((prev) => prev.filter((_, j) => j !== i))}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-4">
        <Field label="Times" htmlFor="team-count">
          <Input
            id="team-count"
            type="number"
            min={TEAMS_MIN}
            max={TEAMS_MAX}
            value={teamCount}
            onChange={(e) => setTeamCount(Number(e.target.value))}
            className="w-24"
          />
        </Field>
        <label className="mt-6 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={lanes} onChange={(e) => setLanes(e.target.checked)} className="size-4 accent-primary" />
          Lanes (Topo, Selva, Meio, Atirador, Suporte)
        </label>
      </div>
      {tooManyForLanes && (
        <p className="text-sm text-muted-foreground">Com lanes, cada time tem no máximo {TEAM_LANES_MAX_SIZE} pessoas: aumente o número de times.</p>
      )}
      <ChannelSelect targets={targets} value={channelId} onChange={setChannelId} />
      <ToolError error={error} />
      <SubmitButton busy={busy} disabled={!ready} onClick={() => void post(() => drawTeams({ channelId, players, teamCount, lanes }))}>
        {posted ? 'Sortear de novo' : 'Sortear times'}
      </SubmitButton>
      <PostedResult message={posted} />
    </ToolPanel>
  )
}
