import { statTotal, type BaseStats } from '@shared/pokemon/game'
import { NATURES } from '@shared/pokemon/natures'
import { cn } from '@/lib/utils'

const AXES: { key: keyof BaseStats; label: string }[] = [
  { key: 'hp', label: 'Vida' },
  { key: 'attack', label: 'Ataque físico' },
  { key: 'defense', label: 'Defesa física' },
  { key: 'speed', label: 'Velocidade' },
  { key: 'spDefense', label: 'Defesa especial' },
  { key: 'spAttack', label: 'Ataque especial' }
]
const WIDTH = 380
const HEIGHT = 280
const CENTER_X = WIDTH / 2
const CENTER_Y = HEIGHT / 2
const RADIUS = 78
const LABEL_GAP = 30
const RINGS = [0.25, 0.5, 0.75, 1]
const MIN_SCALE = 150

const angleOf = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length
const pointAt = (i: number, r: number) => ({ x: CENTER_X + Math.cos(angleOf(i)) * r, y: CENTER_Y + Math.sin(angleOf(i)) * r })
const path = (points: { x: number; y: number }[]) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + 'Z'
const anchorOf = (x: number) => (x < CENTER_X - 5 ? 'end' : x > CENTER_X + 5 ? 'start' : 'middle')

const labelOf = (key: keyof BaseStats) => AXES.find((a) => a.key === key)!.label
const capitalize = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)

export function StatsRadar({ stats, label, nature }: { stats: BaseStats; label: string; nature: string }) {
  const effect = NATURES[nature] ?? {}
  const marker = (key: keyof BaseStats) => (effect.up === key ? ' ▲' : effect.down === key ? ' ▼' : '')
  const scale = Math.max(MIN_SCALE, ...AXES.map((a) => stats[a.key]))
  const points = AXES.map((a, i) => pointAt(i, (stats[a.key] / scale) * RADIUS))

  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label} className="w-96 max-w-full">
        {RINGS.map((ring) => (
          <path key={ring} d={path(AXES.map((_, i) => pointAt(i, ring * RADIUS)))} className="fill-none stroke-border" strokeWidth={1} />
        ))}
        {AXES.map((_, i) => {
          const end = pointAt(i, RADIUS)
          return <line key={i} x1={CENTER_X} y1={CENTER_Y} x2={end.x} y2={end.y} className="stroke-border" strokeWidth={1} />
        })}
        <path d={path(points)} className="fill-primary/25 stroke-primary" strokeWidth={2} strokeLinejoin="round" />
        {AXES.map((axis, i) => {
          const p = points[i]
          const tag = pointAt(i, RADIUS + LABEL_GAP)
          const anchor = anchorOf(tag.x)
          return (
            <g key={axis.key}>
              <circle cx={p.x} cy={p.y} r={4} className="fill-primary stroke-background" strokeWidth={2}>
                <title>{`${axis.label}: ${stats[axis.key]}`}</title>
              </circle>
              <text
                x={tag.x}
                y={tag.y - 3}
                textAnchor={anchor}
                className={cn('text-[10px]', effect.up === axis.key ? 'fill-success' : effect.down === axis.key ? 'fill-destructive' : 'fill-muted-foreground')}
              >
                {axis.label + marker(axis.key)}
              </text>
              <text x={tag.x} y={tag.y + 11} textAnchor={anchor} className="fill-foreground text-[12px] font-bold">
                {stats[axis.key]}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption className="flex flex-col items-center gap-1 text-sm">
        <span>
          Total: <strong>{statTotal(stats)}</strong>
        </span>
        <span aria-label="Natureza">
          Natureza: <strong>{capitalize(nature)}</strong>{' '}
          {effect.up && effect.down ? (
            <>
              (<span className="text-success">▲ {labelOf(effect.up)} +10%</span>, <span className="text-destructive">▼ {labelOf(effect.down)} −10%</span>)
            </>
          ) : (
            <span className="text-muted-foreground">(neutra)</span>
          )}
        </span>
      </figcaption>
    </figure>
  )
}
