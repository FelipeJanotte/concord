import { useState, type FormEvent } from 'react'
import { UserPlus, X } from 'lucide-react'
import {
  LANE_LABELS,
  LANES,
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
import { cn } from '@/lib/utils'
import { PostedResult } from './PostedResult'
import { ImportPeopleButtons, type Person } from './people'
import { ChannelSelect, Field, SubmitButton, ToolError, ToolPanel, usePost, usePostTarget } from './shared'

const key = (name: string): string => name.replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR')

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

function LanePreferences({
  name,
  available,
  chosen,
  onToggle
}: {
  name: string
  available: Lane[]
  chosen: Lane[]
  onToggle: (lane: Lane) => void
}) {
  return (
    <div role="group" aria-label={`Lanes preferidas de ${name}`} className="flex flex-wrap gap-1">
      {available.map((l) => {
        const rank = chosen.indexOf(l) + 1
        return (
          <button
            key={l}
            type="button"
            aria-pressed={rank > 0}
            aria-label={rank > 0 ? `${LANE_LABELS[l]}, ${rank}ª preferência` : LANE_LABELS[l]}
            onClick={() => onToggle(l)}
            className={cn(
              'flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold',
              rank > 0 ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground hover:bg-accent/80'
            )}
          >
            {rank > 0 && <span className="rounded-full bg-primary-foreground/20 px-1.5 tabular-nums">{rank}ª</span>}
            {LANE_LABELS[l]}
          </button>
        )
      })}
    </div>
  )
}

export function TeamRandomizerPanel() {
  const { targets, channelId, setChannelId } = usePostTarget()
  const [players, setPlayers] = useState<TeamPlayer[]>([])
  const [draft, setDraft] = useState('')
  const [teamCount, setTeamCount] = useState(2)
  const [lanes, setLanes] = useState(false)
  const [laneSet, setLaneSet] = useState<Lane[]>([...LANES])
  const { busy, error, posted, post } = usePost()

  const toggleLane = (lane: Lane): void =>
    setLaneSet((prev) => (prev.includes(lane) ? prev.filter((l) => l !== lane) : LANES.filter((l) => l === lane || prev.includes(l))))

  function addDraft(e: FormEvent): void {
    e.preventDefault()
    setPlayers((prev) => mergePlayers(prev, draft.split(/[,\n]/).map((name) => ({ name }))))
    setDraft('')
  }

  const preferred = (p: TeamPlayer): Lane[] => (p.lanes ?? []).filter((l) => laneSet.includes(l))
  const togglePreference = (i: number, lane: Lane): void =>
    setPlayers((prev) =>
      prev.map((p, j) => {
        if (j !== i) return p
        const current = preferred(p)
        return { ...p, lanes: current.includes(lane) ? current.filter((l) => l !== lane) : [...current, lane] }
      })
    )

  const teamSize = teamCount > 0 ? Math.ceil(players.length / teamCount) : 0
  const noLanes = lanes && laneSet.length === 0
  const tooManyForLanes = lanes && !noLanes && players.length > teamCount * laneSet.length
  const ready = !!channelId && players.length >= TEAMS_MIN_PLAYERS && teamCount <= players.length && !tooManyForLanes && !noLanes
  const toSend = (): TeamPlayer[] => players.map((p) => ({ ...p, lanes: preferred(p) }))

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

      {players.length > 0 && lanes && (
        <p className="text-xs text-muted-foreground">Clique nas lanes de cada pessoa na ordem de preferência (1ª, 2ª...). Sem nenhuma, vale qualquer lane.</p>
      )}
      {players.length > 0 && (
        <ul aria-label="Pessoas do sorteio" className="flex flex-col gap-1">
          {players.map((p, i) => (
            <li key={p.accountId ?? p.name} className="flex flex-wrap items-center gap-2 rounded-md bg-panel px-3 py-1.5 text-sm">
              <span className="min-w-24 flex-1 truncate">{p.name}</span>
              {lanes && <LanePreferences name={p.name} available={laneSet} chosen={preferred(p)} onToggle={(lane) => togglePreference(i, lane)} />}
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
          Sortear lanes
        </label>
      </div>
      {lanes && (
        <Field label={`Lanes disponíveis (${laneSet.length}/${LANES.length})`}>
          <div role="group" aria-label="Lanes disponíveis" className="flex flex-wrap gap-2">
            {LANES.map((l) => {
              const on = laneSet.includes(l)
              return (
                <button
                  key={l}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleLane(l)}
                  className={cn(
                    'h-8 rounded-full px-3 text-sm font-semibold',
                    on ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground hover:bg-accent/80'
                  )}
                >
                  {LANE_LABELS[l]}
                </button>
              )
            })}
          </div>
          {!noLanes && !tooManyForLanes && players.length > 0 && laneSet.length > teamSize && (
            <p className="text-xs text-muted-foreground">
              Times de até {teamSize} {teamSize === 1 ? 'pessoa' : 'pessoas'}: nem todas as {laneSet.length} lanes serão usadas em cada time.
            </p>
          )}
        </Field>
      )}
      {noLanes && <p className="text-sm text-muted-foreground">Escolha pelo menos uma lane.</p>}
      {tooManyForLanes && (
        <p className="text-sm text-muted-foreground">
          Com {laneSet.length} {laneSet.length === 1 ? 'lane' : 'lanes'}, cada time tem no máximo {laneSet.length}{' '}
          {laneSet.length === 1 ? 'pessoa' : 'pessoas'}: aumente o número de times ou as lanes.
        </p>
      )}
      <ChannelSelect targets={targets} value={channelId} onChange={setChannelId} />
      <ToolError error={error} />
      <SubmitButton
        busy={busy}
        disabled={!ready}
        onClick={() => void post(() => drawTeams({ channelId, players: toSend(), teamCount, lanes, laneSet }))}
      >
        {posted ? 'Sortear de novo' : 'Sortear times'}
      </SubmitButton>
      <PostedResult message={posted} />
    </ToolPanel>
  )
}
